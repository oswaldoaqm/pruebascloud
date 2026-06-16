import json
import os
import uuid

import boto3

import jwt_utils

dynamodb = boto3.resource("dynamodb")
tabla = dynamodb.Table(os.environ["USERS_TABLE"])

ROLES_VALIDOS = {"CLIENTE", "COCINERO", "DESPACHADOR", "REPARTIDOR", "ADMIN"}


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
    role = data.get("role", "CLIENTE").upper()

    if not all([tenant_id, email, password, nombre]):
        return _response(400, {"error": "Faltan campos: tenant_id, email, password, nombre"})
    if role not in ROLES_VALIDOS:
        return _response(400, {"error": f"Role inválido. Usar: {sorted(ROLES_VALIDOS)}"})
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
    return _response(200, {"token": token, "role": user["role"], "nombre": user["nombre"], "tenant_id": tenant_id})


def me(event, context):
    """Endpoint protegido de prueba: devuelve la identidad que inyectó el authorizer."""
    ctx = event.get("requestContext", {}).get("authorizer", {}).get("lambda", {})
    return _response(200, {"tenant_id": ctx.get("tenant_id"), "email": ctx.get("email"),
                           "role": ctx.get("role"), "nombre": ctx.get("nombre")})
