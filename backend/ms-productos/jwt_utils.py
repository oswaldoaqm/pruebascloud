"""JWT HS256 con librería estándar. Copia de ms-usuarios: cada microservicio
valida tokens por su cuenta (mismo JWT_SECRET), evitando dependencias entre stacks.
"""
import base64
import hashlib
import hmac
import json
import os
import time

SECRET = os.environ.get("JWT_SECRET", "secreto-dev")


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def decode(token: str) -> dict | None:
    try:
        h, p, s = token.split(".")
        expected = hmac.new(SECRET.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(_b64url(expected), s):
            return None
        payload = json.loads(_b64url_decode(p))
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None
