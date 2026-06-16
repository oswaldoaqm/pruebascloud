"""Dominio: sedes (tenants) de la cadena Papa Johns.
- GET  /sedes            público: alimenta el selector de sedes de las webs.
- POST /sedes            SUPERADMIN: dar de alta una sede.
- PATCH /sedes/{id}      SUPERADMIN: editar nombre/dirección o activar/desactivar.
- GET  /sedes/metricas   SUPERADMIN: métricas por sede (trabajadores, pedidos, ingresos).
"""
import json
import os
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

import seed_data

ddb = boto3.resource("dynamodb")
sedes_t = ddb.Table(os.environ["SEDES_TABLE"])
users_t = ddb.Table(os.environ["USERS_TABLE"])
orders_t = ddb.Table(os.environ["ORDERS_TABLE"])


def _auth(event) -> dict:
    return event.get("requestContext", {}).get("authorizer", {}).get("lambda", {})


def _resp(status: int, body) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body, default=lambda o: float(o) if isinstance(o, Decimal) else str(o)),
    }


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def listar(event, context):
    """Público: solo sedes activas (para el selector de clientes y trabajadores)."""
    res = sedes_t.query(KeyConditionExpression=Key("PK").eq("SEDE"))
    sedes = [{k: v for k, v in i.items() if k != "PK"} for i in res.get("Items", [])]
    sedes = [s for s in sedes if s.get("activa", True)]
    sedes.sort(key=lambda s: s["id"])
    return _resp(200, {"sedes": sedes})


def crear(event, context):
    """SUPERADMIN: alta de una sede nueva."""
    if _auth(event).get("role") != "SUPERADMIN":
        return _resp(403, {"error": "Solo el SUPERADMIN puede crear sedes"})
    try:
        data = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _resp(400, {"error": "Body JSON inválido"})

    sid = data.get("id", "").strip().lower()
    nombre = data.get("nombre", "").strip()
    if not sid or not nombre:
        return _resp(400, {"error": "id y nombre son requeridos"})

    item = {
        "PK": "SEDE", "SK": sid, "id": sid, "nombre": nombre,
        "direccion": data.get("direccion", "").strip(), "activa": True, "created_at": _now(),
    }
    try:
        sedes_t.put_item(Item=item, ConditionExpression="attribute_not_exists(SK)")
    except sedes_t.meta.client.exceptions.ConditionalCheckFailedException:
        return _resp(409, {"error": "Ya existe una sede con ese id"})
    return _resp(201, {"message": "Sede creada", "sede": {k: v for k, v in item.items() if k != "PK"}})


def actualizar(event, context):
    """SUPERADMIN: editar nombre/dirección o activar/desactivar la sede."""
    if _auth(event).get("role") != "SUPERADMIN":
        return _resp(403, {"error": "Solo el SUPERADMIN puede editar sedes"})
    sid = (event.get("pathParameters") or {}).get("id", "").lower()
    try:
        data = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _resp(400, {"error": "Body JSON inválido"})

    key = {"PK": "SEDE", "SK": sid}
    if "Item" not in sedes_t.get_item(Key=key):
        return _resp(404, {"error": "Sede no encontrada"})

    sets, values = [], {}
    for campo in ("nombre", "direccion"):
        if campo in data:
            sets.append(f"{campo} = :{campo}"); values[f":{campo}"] = str(data[campo]).strip()
    if "activa" in data:
        sets.append("activa = :a"); values[":a"] = bool(data["activa"])
    if not sets:
        return _resp(400, {"error": "Nada que actualizar"})

    sedes_t.update_item(Key=key, UpdateExpression="SET " + ", ".join(sets), ExpressionAttributeValues=values)
    sede = sedes_t.get_item(Key=key)["Item"]
    return _resp(200, {"message": "Sede actualizada", "sede": {k: v for k, v in sede.items() if k != "PK"}})


def metricas(event, context):
    """SUPERADMIN: métricas agregadas por sede (vista de cadena)."""
    if _auth(event).get("role") != "SUPERADMIN":
        return _resp(403, {"error": "Solo el SUPERADMIN puede ver las métricas de la cadena"})

    res = sedes_t.query(KeyConditionExpression=Key("PK").eq("SEDE"))
    sedes = sorted(res.get("Items", []), key=lambda s: s["id"])

    salida, totales = [], {"trabajadores": 0, "pedidos": 0, "ingresos": Decimal("0"), "entregados": 0}
    for s in sedes:
        tid = s["id"]
        # Trabajadores (no clientes) de la sede
        u = users_t.query(KeyConditionExpression=Key("PK").eq(f"TENANT#{tid}") & Key("SK").begins_with("USER#"))
        trabajadores = [x for x in u.get("Items", []) if x.get("role") != "CLIENTE"]
        # Pedidos de la sede
        o = orders_t.query(KeyConditionExpression=Key("PK").eq(f"TENANT#{tid}") & Key("SK").begins_with("ORDER#"))
        pedidos = o.get("Items", [])
        ingresos = sum((p.get("total", 0) for p in pedidos), Decimal("0"))
        entregados = sum(1 for p in pedidos if p.get("status") == "DELIVERED")
        por_estado = {}
        for p in pedidos:
            por_estado[p["status"]] = por_estado.get(p["status"], 0) + 1

        salida.append({
            "id": tid, "nombre": s.get("nombre", tid), "activa": s.get("activa", True),
            "trabajadores": len(trabajadores), "pedidos": len(pedidos),
            "entregados": entregados, "ingresos": ingresos, "pedidos_por_estado": por_estado,
        })
        totales["trabajadores"] += len(trabajadores)
        totales["pedidos"] += len(pedidos)
        totales["ingresos"] += ingresos
        totales["entregados"] += entregados

    return _resp(200, {"sedes": salida, "totales": totales})


def seed(event, context):
    """Carga las sedes iniciales en t_sedes. Reproducible: sls invoke -f seedSedes"""
    count = 0
    with sedes_t.batch_writer() as batch:
        for s in seed_data.SEDES:
            batch.put_item(Item={
                "PK": "SEDE", "SK": s["id"], "id": s["id"], "nombre": s["nombre"],
                "direccion": s["direccion"], "activa": True, "created_at": _now(),
            })
            count += 1
    return {"message": f"Seed sedes: {count} sedes cargadas"}
