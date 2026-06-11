import json
import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource("dynamodb")
tabla = dynamodb.Table(os.environ["ORDERS_TABLE"])
events = boto3.client("events")
BUS = os.environ["EVENT_BUS"]
RAPPI_API_KEY = os.environ["RAPPI_API_KEY"]

ESTADOS = ["RECEIVED", "COOKING", "PACKING", "DELIVERING", "DELIVERED", "FAILED"]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _response(status: int, body) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body, default=lambda o: float(o) if isinstance(o, Decimal) else str(o)),
    }


def _crear_pedido(tenant_id: str, items: list, origin: str, cliente: dict):
    """Lógica común: guarda el pedido y publica order.placed en EventBridge."""
    if not items or not isinstance(items, list):
        return None, "items debe ser una lista no vacía"
    for it in items:
        if not all(k in it for k in ("product_id", "nombre", "precio", "cant")):
            return None, "Cada item requiere: product_id, nombre, precio, cant"

    order_id = uuid.uuid4().hex[:8]  # corto y legible para la demo
    created_at = _now()
    total = sum(Decimal(str(i["precio"])) * int(i["cant"]) for i in items)

    item = {
        "PK": f"TENANT#{tenant_id}",
        "SK": f"ORDER#{order_id}",
        "GSI1PK": f"TENANT#{tenant_id}#STATUS#RECEIVED",
        "GSI1SK": created_at,
        "order_id": order_id,
        "tenant_id": tenant_id,
        "origin": origin,  # WEB | RAPPI
        "status": "RECEIVED",
        "items": [{**i, "precio": Decimal(str(i["precio"])), "cant": int(i["cant"])} for i in items],
        "total": total,
        "cliente": cliente,
        "created_at": created_at,
    }
    tabla.put_item(Item=item)

    events.put_events(Entries=[{
        "EventBusName": BUS,
        "Source": "ms.pedidos",
        "DetailType": "order.placed",
        "Detail": json.dumps({
            "tenant_id": tenant_id,
            "order_id": order_id,
            "origin": origin,
            "created_at": created_at,
        }),
    }])
    return item, None


def crear(event, context):
    """POST /pedidos — cliente autenticado (web propia)."""
    ctx = event.get("requestContext", {}).get("authorizer", {}).get("lambda", {})
    try:
        data = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _response(400, {"error": "Body JSON inválido"})

    pedido, err = _crear_pedido(
        tenant_id=ctx["tenant_id"],  # del JWT, nunca del body
        items=data.get("items"),
        origin="WEB",
        cliente={"nombre": ctx.get("nombre", ""), "email": ctx.get("email", "")},
    )
    if err:
        return _response(400, {"error": err})
    return _response(201, {"message": "Pedido creado", "order_id": pedido["order_id"],
                           "status": pedido["status"], "total": pedido["total"]})


def crear_rappi(event, context):
    """POST /pedidos/rappi — lo invoca la API de GCP con header x-api-key."""
    headers = event.get("headers") or {}
    if headers.get("x-api-key") != RAPPI_API_KEY:
        return _response(401, {"error": "x-api-key inválida"})

    try:
        data = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _response(400, {"error": "Body JSON inválido"})

    tenant_id = data.get("tenant_id", "").strip()
    if not tenant_id:
        return _response(400, {"error": "Falta tenant_id"})

    pedido, err = _crear_pedido(
        tenant_id=tenant_id,
        items=data.get("items"),
        origin="RAPPI",
        cliente=data.get("cliente", {"nombre": "Cliente Rappi"}),
    )
    if err:
        return _response(400, {"error": err})
    return _response(201, {"message": "Pedido Rappi creado", "order_id": pedido["order_id"],
                           "status": pedido["status"], "total": pedido["total"]})


def obtener(event, context):
    """GET /pedidos/{order_id} — el cliente consulta el estado de su pedido."""
    ctx = event.get("requestContext", {}).get("authorizer", {}).get("lambda", {})
    order_id = event.get("pathParameters", {}).get("order_id", "")

    res = tabla.get_item(Key={"PK": f"TENANT#{ctx['tenant_id']}", "SK": f"ORDER#{order_id}"})
    pedido = res.get("Item")
    if not pedido:
        return _response(404, {"error": "Pedido no encontrado"})
    return _response(200, {k: v for k, v in pedido.items() if not k.startswith(("PK", "SK", "GSI"))})


def listar(event, context):
    """GET /pedidos[?status=RECEIVED] — cola FIFO para trabajadores / historial."""
    ctx = event.get("requestContext", {}).get("authorizer", {}).get("lambda", {})
    tenant_id = ctx["tenant_id"]
    params = event.get("queryStringParameters") or {}
    status = params.get("status")

    if status:
        if status not in ESTADOS:
            return _response(400, {"error": f"status inválido. Usar: {ESTADOS}"})
        # GSI ordenado por created_at → orden de llegada (FIFO)
        res = tabla.query(
            IndexName="GSI1",
            KeyConditionExpression=Key("GSI1PK").eq(f"TENANT#{tenant_id}#STATUS#{status}"),
            ScanIndexForward=True,
        )
    else:
        res = tabla.query(
            KeyConditionExpression=Key("PK").eq(f"TENANT#{tenant_id}") & Key("SK").begins_with("ORDER#")
        )

    pedidos = [{k: v for k, v in i.items() if not k.startswith(("PK", "SK", "GSI"))} for i in res.get("Items", [])]

    # Privacidad: un CLIENTE solo ve SUS pedidos; los trabajadores ven todos los del tenant
    if ctx.get("role") == "CLIENTE":
        pedidos = [p for p in pedidos if p.get("cliente", {}).get("email") == ctx.get("email")]

    pedidos.sort(key=lambda p: p.get("created_at", ""))
    return _response(200, {"count": len(pedidos), "pedidos": pedidos})


def actualizar_status(event, context):
    """Consumidor EventBridge: ms.workflow publica order.step.changed / order.completed."""
    detail = event.get("detail", {})
    tenant_id = detail["tenant_id"]
    order_id = detail["order_id"]
    dt = event.get("detail-type")
    if dt == "order.completed":
        nuevo_status = "DELIVERED"
    elif dt == "order.failed":
        nuevo_status = "FAILED"
    else:
        nuevo_status = detail["status_pedido"]

    tabla.update_item(
        Key={"PK": f"TENANT#{tenant_id}", "SK": f"ORDER#{order_id}"},
        UpdateExpression="SET #s = :s, GSI1PK = :g, updated_at = :u",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={
            ":s": nuevo_status,
            ":g": f"TENANT#{tenant_id}#STATUS#{nuevo_status}",
            ":u": _now(),
        },
    )
    print(f"Pedido {order_id} ({tenant_id}) → {nuevo_status}")
    return {"ok": True}
