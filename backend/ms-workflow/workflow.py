import json
import os
from datetime import datetime, timezone

import boto3

dynamodb = boto3.resource("dynamodb")
tabla = dynamodb.Table(os.environ["WORKFLOW_TABLE"])
sfn = boto3.client("stepfunctions")
events = boto3.client("events")
BUS = os.environ["EVENT_BUS"]
SM_ARN = os.environ["STATE_MACHINE_ARN"]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


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

    tabla.put_item(Item={
        "PK": f"TENANT#{tenant_id}#ORDER#{order_id}",
        "SK": f"STEP#{paso}",
        "GSI1PK": f"TENANT#{tenant_id}#STEP#{paso}#STATUS#PENDING",
        "GSI1SK": now,
        "tenant_id": tenant_id,
        "order_id": order_id,
        "paso": paso,
        "origin": event.get("origin", "WEB"),
        "status": "PENDING",
        "task_token": event["task_token"],
        "started_at": now,
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
