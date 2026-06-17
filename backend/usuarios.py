import json
import os
import uuid

import boto3
from boto3.dynamodb.conditions import Key

import jwt_utils
import seed_data

dynamodb = boto3.resource("dynamodb")
tabla = dynamodb.Table(os.environ["USERS_TABLE"])

ROLES_VALIDOS = {"CLIENTE", "COCINERO", "DESPACHADOR", "REPARTIDOR", "ADMIN", "SUPERADMIN"}
# Roles que un ADMIN de sede puede asignar (NO puede crear SUPERADMIN: eso es nivel cadena).
ROLES_ASIGNABLES = {"CLIENTE", "COCINERO", "DESPACHADOR", "REPARTIDOR", "ADMIN"}


def _auth(event) -> dict:
    return event.get("requestContext", {}).get("authorizer", {}).get("lambda", {})


def _safe(user: dict) -> dict:
    """Quita campos sensibles e internos antes de devolver un usuario."""
    return {k: v for k, v in user.items()
            if k not in ("PK", "SK", "salt", "password_hash")}


def _response(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }


def register(event, context):
    try:
        data = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _response(400, {"error": "Body JSON inválido"})

    tenant_id = data.get("tenant_id", "").strip()
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    nombre = data.get("nombre", "").strip()
    # SEGURIDAD: el registro público SIEMPRE crea CLIENTE. No se acepta el rol del
    # body (evita que alguien se auto-asigne ADMIN/SUPERADMIN). El personal se crea
    # desde el panel de administración (POST /usuarios, autorizado).
    role = "CLIENTE"

    if not all([tenant_id, email, password, nombre]):
        return _response(400, {"error": "Faltan campos: tenant_id, email, password, nombre"})
    if len(password) < 6:
        return _response(400, {"error": "Password mínimo 6 caracteres"})

    salt = uuid.uuid4().hex
    item = {
        "PK": f"TENANT#{tenant_id}",
        "SK": f"USER#{email}",
        "tenant_id": tenant_id,
        "email": email,
        "nombre": nombre,
        "role": role,
        "salt": salt,
        "password_hash": jwt_utils.hash_password(password, salt),
    }
    try:
        tabla.put_item(Item=item, ConditionExpression="attribute_not_exists(PK)")
    except tabla.meta.client.exceptions.ConditionalCheckFailedException:
        return _response(409, {"error": "El usuario ya existe en este tenant"})

    return _response(201, {"message": "Usuario creado", "email": email, "tenant_id": tenant_id, "role": role})


def login(event, context):
    try:
        data = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _response(400, {"error": "Body JSON inválido"})

    tenant_id = data.get("tenant_id", "").strip()
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    if not all([tenant_id, email, password]):
        return _response(400, {"error": "Faltan campos: tenant_id, email, password"})

    res = tabla.get_item(Key={"PK": f"TENANT#{tenant_id}", "SK": f"USER#{email}"})
    user = res.get("Item")
    if not user or jwt_utils.hash_password(password, user["salt"]) != user["password_hash"]:
        return _response(401, {"error": "Credenciales inválidas"})

    token = jwt_utils.encode({
        "tenant_id": tenant_id,
        "email": email,
        "role": user["role"],
        "nombre": user["nombre"],
    })
    return _response(200, {"token": token, "role": user["role"], "nombre": user["nombre"],
                           "tenant_id": tenant_id, "titulo": user.get("titulo", "")})


def me(event, context):
    """Endpoint protegido de prueba: devuelve la identidad que inyectó el authorizer."""
    ctx = event.get("requestContext", {}).get("authorizer", {}).get("lambda", {})
    return _response(200, {"tenant_id": ctx.get("tenant_id"), "email": ctx.get("email"),
                           "role": ctx.get("role"), "nombre": ctx.get("nombre")})


# Plantilla de personal creada en CADA sede (las 4). Password: 123456
# (email, nombre, role, titulo). Los emails genéricos (admin@/cocinero@/...) son
# las cuentas de demo; el resto da volumen realista a cada sede.
WORKERS_DEMO = [
    ("admin@pj.com", "Administrador", "ADMIN", ""),
    # Cocina
    ("cocinero@pj.com", "Mario Quispe", "COCINERO", "Jefe de cocina"),
    ("rosa@pj.com", "Rosa Huamán", "COCINERO", "Empleado del mes"),
    ("carlos@pj.com", "Carlos Ramos", "COCINERO", ""),
    ("diego@pj.com", "Diego Flores", "COCINERO", ""),
    # Despacho
    ("despachador@pj.com", "Lucía Torres", "DESPACHADOR", "Despachador veloz"),
    ("ana@pj.com", "Ana Castillo", "DESPACHADOR", ""),
    ("jorge@pj.com", "Jorge Mendoza", "DESPACHADOR", ""),
    # Reparto
    ("repartidor@pj.com", "Pedro Ríos", "REPARTIDOR", "Repartidor estrella"),
    ("miguel@pj.com", "Miguel Vargas", "REPARTIDOR", ""),
    ("sofia@pj.com", "Sofía Díaz", "REPARTIDOR", ""),
]


def seed_usuarios(event, context):
    """Crea el personal demo (incl. ADMIN) en las 4 sedes. Reproducible:
    sls invoke -f seedUsuarios
    """
    count = 0
    with tabla.batch_writer() as batch:
        for tenant_id in seed_data.TENANTS:
            for email, nombre, role, titulo in WORKERS_DEMO:
                salt = uuid.uuid4().hex
                batch.put_item(Item={
                    "PK": f"TENANT#{tenant_id}",
                    "SK": f"USER#{email}",
                    "tenant_id": tenant_id,
                    "email": email,
                    "nombre": nombre,
                    "role": role,
                    "titulo": titulo,
                    "salt": salt,
                    "password_hash": jwt_utils.hash_password("123456", salt),
                })
                count += 1
        # SUPERADMIN de la cadena, en la sede central
        salt = uuid.uuid4().hex
        batch.put_item(Item={
            "PK": f"TENANT#{seed_data.CENTRAL}",
            "SK": "USER#superadmin@pj.com",
            "tenant_id": seed_data.CENTRAL,
            "email": "superadmin@pj.com",
            "nombre": "Super Administrador",
            "role": "SUPERADMIN",
            "salt": salt,
            "password_hash": jwt_utils.hash_password("123456", salt),
        })
        count += 1
    return {"message": f"Seed usuarios: {count} cuentas ({len(seed_data.TENANTS)} sedes + central)",
            "password": "123456"}


# ─────────────────────────────────────────────────────────────────────────────
# Panel de administración (solo rol ADMIN). Gestiona el personal de la sede.
# ─────────────────────────────────────────────────────────────────────────────

def listar_usuarios(event, context):
    """GET /usuarios — lista el personal de la sede (solo ADMIN)."""
    ctx = _auth(event)
    if ctx.get("role") != "ADMIN":
        return _response(403, {"error": "Solo el administrador puede ver el personal"})

    res = tabla.query(
        KeyConditionExpression=Key("PK").eq(f"TENANT#{ctx['tenant_id']}") & Key("SK").begins_with("USER#")
    )
    # Solo personal (staff): los CLIENTE no se gestionan desde este panel.
    usuarios = [_safe(u) for u in res.get("Items", []) if u.get("role") != "CLIENTE"]
    usuarios.sort(key=lambda u: (u.get("role", ""), u.get("nombre", "")))
    return _response(200, {"count": len(usuarios), "usuarios": usuarios})


def crear_usuario(event, context):
    """POST /usuarios — el ADMIN crea un trabajador en su sede."""
    ctx = _auth(event)
    if ctx.get("role") != "ADMIN":
        return _response(403, {"error": "Solo el administrador puede crear trabajadores"})

    try:
        data = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _response(400, {"error": "Body JSON inválido"})

    email = data.get("email", "").strip().lower()
    nombre = data.get("nombre", "").strip()
    role = data.get("role", "COCINERO").upper()
    titulo = data.get("titulo", "").strip()
    password = data.get("password", "123456")

    if not email or not nombre:
        return _response(400, {"error": "Faltan campos: email, nombre"})
    if role not in ROLES_ASIGNABLES:
        return _response(400, {"error": f"Role inválido. Usar: {sorted(ROLES_ASIGNABLES)}"})

    tenant_id = ctx["tenant_id"]  # del token, nunca del body
    salt = uuid.uuid4().hex
    item = {
        "PK": f"TENANT#{tenant_id}", "SK": f"USER#{email}",
        "tenant_id": tenant_id, "email": email, "nombre": nombre,
        "role": role, "titulo": titulo, "salt": salt,
        "password_hash": jwt_utils.hash_password(password, salt),
    }
    try:
        tabla.put_item(Item=item, ConditionExpression="attribute_not_exists(PK)")
    except tabla.meta.client.exceptions.ConditionalCheckFailedException:
        return _response(409, {"error": "Ya existe un usuario con ese email en la sede"})
    return _response(201, {"message": "Trabajador creado", "usuario": _safe(item)})


def actualizar_usuario(event, context):
    """PATCH /usuarios/{email} — cambia rol y/o título (solo ADMIN)."""
    ctx = _auth(event)
    if ctx.get("role") != "ADMIN":
        return _response(403, {"error": "Solo el administrador puede editar trabajadores"})

    email = (event.get("pathParameters") or {}).get("email", "").lower()
    try:
        data = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _response(400, {"error": "Body JSON inválido"})

    key = {"PK": f"TENANT#{ctx['tenant_id']}", "SK": f"USER#{email}"}
    if "Item" not in tabla.get_item(Key=key):
        return _response(404, {"error": "Trabajador no encontrado"})

    # Protección anti-bloqueo: el admin no puede quitarse a sí mismo el rol ADMIN
    if email == ctx.get("email") and "role" in data and data["role"].upper() != "ADMIN":
        return _response(400, {"error": "No puedes quitarte tu propio rol de administrador"})

    sets, names, values = [], {}, {}
    if "role" in data:
        role = data["role"].upper()
        if role not in ROLES_ASIGNABLES:
            return _response(400, {"error": f"Role inválido. Usar: {sorted(ROLES_ASIGNABLES)}"})
        sets.append("#r = :r"); names["#r"] = "role"; values[":r"] = role
    if "titulo" in data:
        sets.append("titulo = :t"); values[":t"] = data["titulo"].strip()
    if not sets:
        return _response(400, {"error": "Nada que actualizar (enviar role y/o titulo)"})

    kwargs = {"Key": key, "UpdateExpression": "SET " + ", ".join(sets), "ExpressionAttributeValues": values}
    if names:  # solo cuando hay nombres reservados (ej. 'role'); pasar None rompe boto3
        kwargs["ExpressionAttributeNames"] = names
    tabla.update_item(**kwargs)
    user = tabla.get_item(Key=key)["Item"]
    return _response(200, {"message": "Trabajador actualizado", "usuario": _safe(user)})


def eliminar_usuario(event, context):
    """DELETE /usuarios/{email} — elimina un trabajador (solo ADMIN)."""
    ctx = _auth(event)
    if ctx.get("role") != "ADMIN":
        return _response(403, {"error": "Solo el administrador puede eliminar trabajadores"})

    email = (event.get("pathParameters") or {}).get("email", "").lower()
    if email == ctx.get("email"):
        return _response(400, {"error": "No puedes eliminar tu propia cuenta"})

    tabla.delete_item(Key={"PK": f"TENANT#{ctx['tenant_id']}", "SK": f"USER#{email}"})
    return _response(200, {"message": "Trabajador eliminado", "email": email})
