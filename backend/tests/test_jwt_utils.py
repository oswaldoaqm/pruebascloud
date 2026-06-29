"""Tests unitarios de jwt_utils (lógica pura, sin AWS)."""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))  # importar backend/
os.environ.setdefault("JWT_SECRET", "test-secret")

import jwt_utils


def test_encode_decode_roundtrip():
    payload = {"tenant_id": "pj-miraflores", "email": "a@b.com", "role": "COCINERO"}
    tok = jwt_utils.encode(payload)
    out = jwt_utils.decode(tok)
    assert out is not None
    assert out["email"] == "a@b.com"
    assert out["role"] == "COCINERO"
    assert out["tenant_id"] == "pj-miraflores"


def test_decode_token_invalido():
    assert jwt_utils.decode("esto.no.es.un.jwt") is None
    assert jwt_utils.decode("") is None


def test_decode_firma_alterada():
    tok = jwt_utils.encode({"email": "x@y.com"})
    h, p, s = tok.split(".")
    alterado = f"{h}.{p}.{s}xyz"          # firma corrupta
    assert jwt_utils.decode(alterado) is None


def test_token_expirado():
    tok = jwt_utils.encode({"email": "x@y.com"}, expires_in=-10)  # ya expirado
    assert jwt_utils.decode(tok) is None


def test_hash_password_deterministico_y_con_salt():
    h1 = jwt_utils.hash_password("123456", "salt1")
    h2 = jwt_utils.hash_password("123456", "salt1")
    h3 = jwt_utils.hash_password("123456", "salt2")
    assert h1 == h2          # mismo input → mismo hash
    assert h1 != h3          # distinto salt → distinto hash
    assert jwt_utils.hash_password("otra", "salt1") != h1
