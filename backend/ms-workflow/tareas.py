import json
import os
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource("dynamodb")
tabla = dynamodb.Table(os.environ["WORKFLOW_TABLE"])
sfn = boto3.client("stepfunctions")

PASOS = ["COCINAR", "EMPACAR", "REPARTIR", "ENTREGAR"]
# Qué rol puede atender cada paso (ADMIN puede todo)
ROL_PASO = {"COCINERO": ["COCINAR"], "DESPACHADOR": ["EMPACAR"], "REPARTIDOR": ["REPARTIR", "ENTREGAR"]}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _response(status: int, body) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body, default=lambda o: float(o) if isinstance(o, Decimal) else str(o)),
    }


def _auth(event) -> dict:
    return event.get("requestContext", {}).get("authorizer", {}).get("lambda", {})


def _puede(role: str, paso: str) -> bool:
    return role == "ADMIN" or paso in ROL_PASO.get(role, [])


def listar(event, context):
    """GET /tareas?paso=COCINAR&status=PENDING — cola FIFO del rol."""
    ctx = _auth(event)
    params = event.get("queryStringParameters") or {}
    paso = params.get("paso", "").upper()
    status = params.get("status", "PENDING").upper()
    if paso not in PASOS:
        return _response(400, {"error": f"paso inválido. Usar: {PASOS}"})

    res = tabla.query(
        IndexName="GSI1",
        KeyConditionExpression=Key("GSI1PK").eq(f"TENANT#{ctx['tenant_id']}#STEP#{paso}#STATUS#{status}"),
        ScanIndexForward=True,  # FIFO: más antiguo primero
    )
    tareas = [{k: v for k, v in i.items() if k not in ("PK", "SK", "GSI1PK", "GSI1SK", "task_token")}
              for i in res.get("Items", [])]
    return _response(200, {"count": len(tareas), "tareas": tareas})


def tomar(event, context):
    """POST /tareas/{order_id}/{paso}/tomar — el trabajador toma la tarea."""
    ctx = _auth(event)
    p = event.get("pathParameters", {})
    order_id, paso = p.get("order_id"), p.get("paso", "").upper()
    if paso not in PASOS:
        return _response(400, {"error": f"paso inválido. Usar: {PASOS}"})
    if not _puede(ctx.get("role", ""), paso):
        return _response(403, {"error": f"El rol {ctx.get('role')} no puede atender {paso}"})

    try:
        tabla.update_item(
            Key={"PK": f"TENANT#{ctx['tenant_id']}#ORDER#{order_id}", "SK": f"STEP#{paso}"},
            UpdateExpression="SET #s = :ip, GSI1PK = :g, taken_at = :n, worker_id = :wid, worker_name = :wn",
            ConditionExpression="#s = :pend",  # solo si nadie la tomó antes
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":ip": "IN_PROGRESS",
                ":pend": "PENDING",
                ":g": f"TENANT#{ctx['tenant_id']}#STEP#{paso}#STATUS#IN_PROGRESS",
                ":n": _now(),
                ":wid": ctx["email"],
                ":wn": ctx.get("nombre", ""),
            },
        )
    except tabla.meta.client.exceptions.ConditionalCheckFailedException:
        return _response(409, {"error": "La tarea no está PENDING (¿ya la tomó alguien?)"})
    return _response(200, {"message": f"Tarea {paso} tomada", "order_id": order_id, "worker": ctx.get("nombre")})


def completar(event, context):
    """POST /tareas/{order_id}/{paso}/completar — send_task_success → el workflow avanza."""
    ctx = _auth(event)
    p = event.get("pathParameters", {})
    order_id, paso = p.get("order_id"), p.get("paso", "").upper()
    if paso not in PASOS:
        return _response(400, {"error": f"paso inválido. Usar: {PASOS}"})
    if not _puede(ctx.get("role", ""), paso):
        return _response(403, {"error": f"El rol {ctx.get('role')} no puede atender {paso}"})

    key = {"PK": f"TENANT#{ctx['tenant_id']}#ORDER#{order_id}", "SK": f"STEP#{paso}"}
    item = tabla.get_item(Key=key).get("Item")
    if not item:
        return _response(404, {"error": "Tarea no encontrada"})
    if item["status"] == "DONE":
        return _response(409, {"error": "La tarea ya fue completada"})
    if item["status"] != "IN_PROGRESS":
        return _response(409, {"error": f"Primero debes tomar la tarea (estado actual: {item['status']})"})

    # 1. Despertar al workflow (el corazón del patrón Task Token)
    sfn.send_task_success(
        taskToken=item["task_token"],
        output=json.dumps({"order_id": order_id, "paso": paso, "worker": ctx.get("nombre", "")}),
    )

    # 2. Registrar fin del paso
    tabla.update_item(
        Key=key,
        UpdateExpression="SET #s = :d, GSI1PK = :g, finished_at = :n, worker_id = :wid, worker_name = :wn",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={
            ":d": "DONE",
            ":g": f"TENANT#{ctx['tenant_id']}#STEP#{paso}#STATUS#DONE",
            ":n": _now(),
            ":wid": ctx["email"],
            ":wn": ctx.get("nombre", ""),
        },
    )
    return _response(200, {"message": f"Tarea {paso} completada, workflow avanza", "order_id": order_id})


def timeline(event, context):
    """GET /tareas/{order_id} — todos los pasos del pedido con tiempos y responsables."""
    ctx = _auth(event)
    order_id = event.get("pathParameters", {}).get("order_id")
    res = tabla.query(
        KeyConditionExpression=Key("PK").eq(f"TENANT#{ctx['tenant_id']}#ORDER#{order_id}")
    )
    pasos = [{k: v for k, v in i.items() if k not in ("PK", "SK", "GSI1PK", "GSI1SK", "task_token")}
             for i in res.get("Items", [])]
    pasos.sort(key=lambda x: PASOS.index(x["paso"]) if x["paso"] in PASOS else 99)
    return _response(200, {"order_id": order_id, "pasos": pasos})


def dashboard(event, context):
    """GET /dashboard — resumen del tenant: tareas por estado, tiempo promedio por paso, ranking."""
    ctx = _auth(event)
    tenant_prefix = f"TENANT#{ctx['tenant_id']}#"

    items, start_key = [], None
    while True:
        kwargs = {"FilterExpression": "begins_with(PK, :p)",
                  "ExpressionAttributeValues": {":p": tenant_prefix}}
        if start_key:
            kwargs["ExclusiveStartKey"] = start_key
        res = tabla.scan(**kwargs)
        items.extend(res.get("Items", []))
        start_key = res.get("LastEvaluatedKey")
        if not start_key:
            break

    por_estado = {"PENDING": 0, "IN_PROGRESS": 0, "DONE": 0}
    duraciones = {p: [] for p in PASOS}
    por_trabajador = {}

    for i in items:
        por_estado[i["status"]] = por_estado.get(i["status"], 0) + 1
        if i["status"] == "DONE" and i.get("finished_at") and i.get("started_at"):
            ini = datetime.fromisoformat(i["started_at"])
            fin = datetime.fromisoformat(i["finished_at"])
            duraciones[i["paso"]].append((fin - ini).total_seconds())
            wn = i.get("worker_name") or i.get("worker_id", "?")
            por_trabajador[wn] = por_trabajador.get(wn, 0) + 1

    tiempo_promedio = {
        paso: round(sum(d) / len(d) / 60, 2) if d else None  # minutos
        for paso, d in duraciones.items()
    }

    return _response(200, {
        "tenant_id": ctx["tenant_id"],
        "tareas_por_estado": por_estado,
        "tiempo_promedio_min_por_paso": tiempo_promedio,
        "tareas_completadas_por_trabajador": por_trabajador,
    })
