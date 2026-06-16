import jwt_utils


def handler(event, context):
    auth_header = (event.get("headers") or {}).get("authorization", "")
    if not auth_header.startswith("Bearer "):
        return {"isAuthorized": False}

    payload = jwt_utils.decode(auth_header[7:])
    if payload is None:
        return {"isAuthorized": False}

    return {
        "isAuthorized": True,
        "context": {
            "tenant_id": payload["tenant_id"],
            "email": payload["email"],
            "role": payload["role"],
            "nombre": payload.get("nombre", ""),
        },
    }
