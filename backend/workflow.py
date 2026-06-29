import json
import os
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource("dynamodb")
tabla = dynamodb.Table(os.environ["WORKFLOW_TABLE"])
orders_tbl = dynamodb.Table(os.environ["ORDERS_TABLE"])
sfn = boto3.client("stepfunctions")
events = boto3.client("events")
sqs = boto3.client("sqs")
sns = boto3.client("sns")
BUS = os.environ["EVENT_BUS"]
SM_ARN = os.environ["STATE_MACHINE_ARN"]
RAPPI_COLA_URL = os.environ.get("RAPPI_COLA_URL", "")
SNS_TOPIC_ARN = os.environ.get("SNS_TOPIC_ARN", "")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _response(status: int, body: dict) -> dict:
    return {"statusCode": status, "headers": {"Content-Type": "application/json"}, "body": json.dumps(body)}


def cancelar(event, context):
    """POST /pedidos/{order_id}/cancelar — cancela un pedido en curso.

    Usa el lado de FALLO del patrón Wait for Callback: send_task_failure sobre el
    token del paso activo → el workflow cae en NotificarFallo → evento order.failed
    → el pedido pasa a FAILED y (si vino de Rappi) se notifica la cancelación.
    """
    ctx = event.get("requestContext", {}).get("authorizer", {}).get("lambda", {})
    tenant = ctx["tenant_id"]
    order_id = (event.get("pathParameters") or {}).get("order_id", "")

    pedido = orders_tbl.get_item(Key={"PK": f"TENANT#{tenant}", "SK": f"ORDER#{order_id}"}).get("Item")
    if not pedido:
        return _response(404, {"error": "Pedido no encontrado"})
    # Un CLIENTE solo puede cancelar su propio pedido
    if ctx.get("role") == "CLIENTE" and pedido.get("cliente", {}).get("email") != ctx.get("email"):
        return _response(403, {"error": "No puedes cancelar un pedido que no es tuyo"})
    if pedido["status"] in ("DELIVERED", "FAILED"):
        return _response(409, {"error": f"No se puede cancelar un pedido en estado {pedido['status']}"})

    # Buscar el paso activo (PENDING o IN_PROGRESS) que tiene el task token
    res = tabla.query(KeyConditionExpression=Key("PK").eq(f"TENANT#{tenant}#ORDER#{order_id}"))
    activo = next((i for i in res.get("Items", []) if i.get("status") in ("PENDING", "IN_PROGRESS")), None)
    if not activo or not activo.get("task_token"):
        return _response(409, {"error": "El pedido no tiene un paso activo cancelable"})

    sfn.send_task_failure(taskToken=activo["task_token"], error="Cancelado",
                          cause=f"Pedido cancelado por {ctx.get('email')}")
    tabla.update_item(
        Key={"PK": activo["PK"], "SK": activo["SK"]},
        UpdateExpression="SET #s = :c, GSI1PK = :g, finished_at = :n",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={
            ":c": "CANCELLED",
            ":g": f"TENANT#{tenant}#STEP#{activo['paso']}#STATUS#CANCELLED",
            ":n": _now(),
        },
    )
    return _response(200, {"message": "Pedido cancelado", "order_id": order_id})


def start_workflow(event, context):
    """Consumidor EventBridge de order.placed: inicia la ejecución de Step Functions."""
    d = event["detail"]
    res = sfn.start_execution(
        stateMachineArn=SM_ARN,
        name=f"{d['tenant_id']}-{d['order_id']}",  # visible en la consola de SFN
        input=json.dumps({
            "tenant_id": d["tenant_id"],
            "order_id": d["order_id"],
            "origin": d.get("origin", "WEB"),
        }),
    )
    print(f"Workflow iniciado: {res['executionArn']}")
    return {"ok": True}


def asignar_tarea(event, context):
    """Invocada por SFN con waitForTaskToken.
    Guarda el token en DynamoDB (¡crítico!) y publica el cambio de paso.
    Al retornar, la ejecución queda PAUSADA hasta send_task_success.
    """
    tenant_id = event["tenant_id"]
    order_id = event["order_id"]
    paso = event["paso"]
    now = _now()

    # Resumen de productos del pedido, para que el trabajador sepa QUÉ preparar.
    pedido = orders_tbl.get_item(Key={"PK": f"TENANT#{tenant_id}", "SK": f"ORDER#{order_id}"}).get("Item", {})
    items_resumen = ", ".join(f"{int(it.get('cant', 1))}x {it.get('nombre', '?')}" for it in pedido.get("items", [])) or "—"
    cliente = (pedido.get("cliente") or {}).get("nombre", "")

    tabla.put_item(Item={
        "PK": f"TENANT#{tenant_id}#ORDER#{order_id}",
        "SK": f"STEP#{paso}",
        "GSI1PK": f"TENANT#{tenant_id}#STEP#{paso}#STATUS#PENDING",
        "GSI1SK": now,
        "GSI2PK": f"TENANT#{tenant_id}",   # dashboard por tenant (query, no scan)
        "GSI2SK": now,
        "tenant_id": tenant_id,
        "order_id": order_id,
        "paso": paso,
        "origin": event.get("origin", "WEB"),
        "status": "PENDING",
        "task_token": event["task_token"],
        "started_at": now,
        "items_resumen": items_resumen,
        "cliente": cliente,
    })

    events.put_events(Entries=[{
        "EventBusName": BUS,
        "Source": "ms.workflow",
        "DetailType": "order.step.changed",
        "Detail": json.dumps({
            "tenant_id": tenant_id,
            "order_id": order_id,
            "paso": paso,
            "status_pedido": event["status_pedido"],
            "origin": event.get("origin", "WEB"),
        }),
    }])
    return {"ok": True, "paso": paso}


def encolar_rappi(event, context):
    """Consumidor EventBridge (origin=RAPPI): NO llama a OCI directo, sino que encola el
    cambio en SQS. Así AWS queda desacoplado de la disponibilidad de la nube externa.
    """
    detail = event["detail"]
    msg = {**detail, "dt": event.get("detail-type")}
    sqs.send_message(QueueUrl=RAPPI_COLA_URL, MessageBody=json.dumps(msg))
    print(f"Encolado a SQS: {detail['order_id']} ({event.get('detail-type')})")
    return {"ok": True}


def notify_rappi(event, context):
    """Consumidor de la cola SQS 'rappi-cola': actualiza el estado en 'Rappi' (API-2 en OCI).
    Si OCI falla, la excepción propaga → SQS reintenta → tras 3 intentos cae a 'rappi-dlq'.
    """
    import urllib.request

    url = os.environ.get("RAPPI_STATUS_URL", "")
    if not url:
        print("RAPPI_STATUS_URL no configurada; se omite notificación")
        return {"ok": False, "skipped": True}

    for record in event.get("Records", []):
        d = json.loads(record["body"])
        dt = d.get("dt")
        if dt == "order.completed":
            paso, status = "FIN", "DELIVERED"
        elif dt == "order.failed":
            paso, status = "ERROR", "FAILED"
        else:
            paso, status = d.get("paso"), d.get("status_pedido")

        body = json.dumps({
            "order_id": d["order_id"], "tenant_id": d["tenant_id"],
            "paso": paso, "status_pedido": status,
        }).encode()
        req = urllib.request.Request(
            f"{url}/status", data=body, method="POST",
            headers={"Content-Type": "application/json", "x-api-key": os.environ["RAPPI_API_KEY"]},
        )
        # Si OCI está caído, urlopen lanza excepción → el mensaje vuelve a la cola (DLQ tras 3)
        with urllib.request.urlopen(req, timeout=8) as r:
            print(f"Rappi notificado: {d['order_id']} → {status} (HTTP {r.status})")
    return {"ok": True}


def notificar_cliente(event, context):
    """Consumidor EventBridge (order.completed / order.failed): publica en SNS una
    notificación saliente (pub/sub). El topic puede tener múltiples suscriptores (email, SMS…).
    """
    if not SNS_TOPIC_ARN:
        return {"ok": False, "skipped": True}
    detail = event["detail"]
    oid = detail.get("order_id"); sede = detail.get("tenant_id")
    if event.get("detail-type") == "order.completed":
        subject = f"Pedido {oid} entregado"
        msg = f"¡Buenas noticias! El pedido #{oid} de la sede {sede} fue ENTREGADO. ¡Gracias por tu compra! 🍕"
    else:
        subject = f"Pedido {oid} cancelado"
        msg = f"El pedido #{oid} de la sede {sede} fue CANCELADO. Si no fuiste tú, contáctanos."
    sns.publish(TopicArn=SNS_TOPIC_ARN, Subject=subject, Message=msg)
    print(f"SNS publicado: {oid} ({subject})")
    return {"ok": True}


def fallar(event, context):
    """Estado de error del workflow: publica order.failed (→ pedido FAILED)."""
    events.put_events(Entries=[{
        "EventBusName": BUS,
        "Source": "ms.workflow",
        "DetailType": "order.failed",
        "Detail": json.dumps({
            "tenant_id": event["tenant_id"],
            "order_id": event["order_id"],
            "origin": event.get("origin", "WEB"),
        }),
    }])
    return {"ok": True}


def finalizar(event, context):
    """Último estado del workflow: publica order.completed (→ pedido DELIVERED)."""
    events.put_events(Entries=[{
        "EventBusName": BUS,
        "Source": "ms.workflow",
        "DetailType": "order.completed",
        "Detail": json.dumps({
            "tenant_id": event["tenant_id"],
            "order_id": event["order_id"],
            "origin": event.get("origin", "WEB"),
        }),
    }])
    return {"ok": True}
