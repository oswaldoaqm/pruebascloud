import json
import os
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

import seed_data

dynamodb = boto3.resource("dynamodb")
tabla = dynamodb.Table(os.environ["PRODUCTS_TABLE"])
BUCKET = os.environ["IMAGES_BUCKET"]


def _img_url(image_key: str) -> str:
    return f"https://{BUCKET}.s3.amazonaws.com/{image_key}"


def _response(status: int, body) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body, default=lambda o: float(o) if isinstance(o, Decimal) else str(o)),
    }


def listar(event, context):
    """GET /productos?tenant_id=pj-miraflores[&categoria=pizzas] — público (el cliente ve el catálogo antes de loguearse)."""
    params = event.get("queryStringParameters") or {}
    tenant_id = params.get("tenant_id", "").strip()
    if not tenant_id:
        return _response(400, {"error": "Falta query param tenant_id"})

    res = tabla.query(KeyConditionExpression=Key("PK").eq(f"TENANT#{tenant_id}") & Key("SK").begins_with("PROD#"))
    items = res.get("Items", [])

    categoria = params.get("categoria")
    if categoria:
        items = [i for i in items if i.get("categoria") == categoria]

    productos = [{k: v for k, v in i.items() if k not in ("PK", "SK")} for i in items]
    return _response(200, {"tenant_id": tenant_id, "count": len(productos), "productos": productos})


def crear(event, context):
    """POST /productos — solo ADMIN del tenant (JWT)."""
    ctx = event.get("requestContext", {}).get("authorizer", {}).get("lambda", {})
    if ctx.get("role") != "ADMIN":
        return _response(403, {"error": "Solo ADMIN puede crear productos"})

    try:
        data = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _response(400, {"error": "Body JSON inválido"})

    requeridos = ["id", "nombre", "categoria", "precio"]
    if not all(data.get(c) for c in requeridos):
        return _response(400, {"error": f"Faltan campos: {requeridos}"})

    tenant_id = ctx["tenant_id"]  # SIEMPRE del token, nunca del body (multi-tenancy)
    item = {
        "PK": f"TENANT#{tenant_id}",
        "SK": f"PROD#{data['id']}",
        "product_id": data["id"],
        "nombre": data["nombre"],
        "categoria": data["categoria"],
        "precio": Decimal(str(data["precio"])),
        "descripcion": data.get("descripcion", ""),
        "image_url": _img_url(data.get("image_key", "placeholder.jpg")),
    }
    tabla.put_item(Item=item)
    return _response(201, {"message": "Producto creado", "product_id": data["id"], "tenant_id": tenant_id})


def actualizar(event, context):
    """PATCH /productos/{product_id} — editar producto de la sede (solo ADMIN)."""
    ctx = event.get("requestContext", {}).get("authorizer", {}).get("lambda", {})
    if ctx.get("role") != "ADMIN":
        return _response(403, {"error": "Solo ADMIN puede editar productos"})

    pid = (event.get("pathParameters") or {}).get("product_id", "")
    try:
        data = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _response(400, {"error": "Body JSON inválido"})

    key = {"PK": f"TENANT#{ctx['tenant_id']}", "SK": f"PROD#{pid}"}
    if "Item" not in tabla.get_item(Key=key):
        return _response(404, {"error": "Producto no encontrado"})

    sets, values = [], {}
    for campo in ("nombre", "categoria", "descripcion"):
        if campo in data:
            sets.append(f"{campo} = :{campo}"); values[f":{campo}"] = str(data[campo])
    if "precio" in data:
        sets.append("precio = :precio"); values[":precio"] = Decimal(str(data["precio"]))
    if "image_key" in data:
        sets.append("image_url = :img"); values[":img"] = _img_url(data["image_key"])
    if not sets:
        return _response(400, {"error": "Nada que actualizar"})

    tabla.update_item(Key=key, UpdateExpression="SET " + ", ".join(sets), ExpressionAttributeValues=values)
    prod = tabla.get_item(Key=key)["Item"]
    return _response(200, {"message": "Producto actualizado",
                           "producto": {k: v for k, v in prod.items() if k not in ("PK", "SK")}})


def eliminar(event, context):
    """DELETE /productos/{product_id} — eliminar producto de la sede (solo ADMIN)."""
    ctx = event.get("requestContext", {}).get("authorizer", {}).get("lambda", {})
    if ctx.get("role") != "ADMIN":
        return _response(403, {"error": "Solo ADMIN puede eliminar productos"})
    pid = (event.get("pathParameters") or {}).get("product_id", "")
    tabla.delete_item(Key={"PK": f"TENANT#{ctx['tenant_id']}", "SK": f"PROD#{pid}"})
    return _response(200, {"message": "Producto eliminado", "product_id": pid})


def seed(event, context):
    """Carga el catálogo Papa Johns en todos los tenants. Invocar manualmente:
    sls invoke -f seed
    """
    count = 0
    with tabla.batch_writer() as batch:
        for tenant_id in seed_data.TENANTS:
            for p in seed_data.PRODUCTOS:
                batch.put_item(Item={
                    "PK": f"TENANT#{tenant_id}",
                    "SK": f"PROD#{p['id']}",
                    "product_id": p["id"],
                    "nombre": p["nombre"],
                    "categoria": p["categoria"],
                    "precio": Decimal(str(p["precio"])),
                    "descripcion": p["descripcion"],
                    "image_url": _img_url(p["image_key"]),
                })
                count += 1
    return {"message": f"Seed completado: {count} productos en {len(seed_data.TENANTS)} tenants"}
