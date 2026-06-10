"""API-2 'Rappi Status' (OCI, contenedor Docker).
AWS la invoca en cada paso del workflow (Lambda notify_rappi vía EventBridge)
para actualizar el estado del pedido 'en Rappi'. Persistencia: SQLite.

POST /orders             registro inicial (la llama API-1)         [x-api-key]
POST /status             {order_id, tenant_id, paso, status_pedido} [x-api-key]
GET  /orders/{order_id}  estado e historial del pedido (público, demo)
GET  /orders             últimos 20 pedidos (público, demo)
"""
import json
import os
import sqlite3
from datetime import datetime, timezone

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

API_KEY = os.environ["API_KEY"]
DB_PATH = os.environ.get("DB_PATH", "rappi.db")

app = FastAPI(title="Rappi Status API")


def _db():
    con = sqlite3.connect(DB_PATH)
    con.execute("""CREATE TABLE IF NOT EXISTS orders (
        order_id TEXT PRIMARY KEY, tenant_id TEXT, cliente TEXT, items TEXT,
        total REAL, status TEXT, history TEXT, updated_at TEXT)""")
    return con


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _check_key(key: str | None):
    if key != API_KEY:
        raise HTTPException(401, "x-api-key inválida")


def _row_to_dict(r) -> dict:
    return {"order_id": r[0], "tenant_id": r[1], "cliente": json.loads(r[2] or "{}"),
            "items": json.loads(r[3] or "[]"), "total": r[4], "status": r[5],
            "history": json.loads(r[6] or "[]"), "updated_at": r[7]}


class NuevoPedido(BaseModel):
    order_id: str
    tenant_id: str
    cliente: dict = {}
    items: list = []
    total: float | None = None


class CambioEstado(BaseModel):
    order_id: str
    tenant_id: str | None = None
    paso: str = "?"
    status_pedido: str


@app.get("/")
def health():
    return {"service": "rappi-status", "ok": True}


@app.post("/orders", status_code=201)
def registrar(p: NuevoPedido, x_api_key: str | None = Header(default=None)):
    _check_key(x_api_key)
    con = _db()
    history = [{"paso": "PEDIDO_CREADO", "status": "RECEIVED", "ts": _now()}]
    con.execute("INSERT OR REPLACE INTO orders VALUES (?,?,?,?,?,?,?,?)",
                (p.order_id, p.tenant_id, json.dumps(p.cliente), json.dumps(p.items),
                 p.total, "RECEIVED", json.dumps(history), _now()))
    con.commit(); con.close()
    return {"ok": True, "order_id": p.order_id, "status": "RECEIVED"}


@app.post("/status")
def actualizar(c: CambioEstado, x_api_key: str | None = Header(default=None)):
    _check_key(x_api_key)
    con = _db()
    row = con.execute("SELECT history FROM orders WHERE order_id=?", (c.order_id,)).fetchone()
    history = json.loads(row[0]) if row else []
    history.append({"paso": c.paso, "status": c.status_pedido, "ts": _now()})
    if row:
        con.execute("UPDATE orders SET status=?, history=?, updated_at=? WHERE order_id=?",
                    (c.status_pedido, json.dumps(history), _now(), c.order_id))
    else:  # por si AWS notifica antes del registro inicial
        con.execute("INSERT INTO orders VALUES (?,?,?,?,?,?,?,?)",
                    (c.order_id, c.tenant_id, "{}", "[]", None,
                     c.status_pedido, json.dumps(history), _now()))
    con.commit(); con.close()
    return {"ok": True, "order_id": c.order_id, "status": c.status_pedido}


@app.get("/orders/{order_id}")
def obtener(order_id: str):
    con = _db()
    r = con.execute("SELECT * FROM orders WHERE order_id=?", (order_id,)).fetchone()
    con.close()
    if not r:
        raise HTTPException(404, "Pedido no encontrado en Rappi")
    return _row_to_dict(r)


@app.get("/orders")
def listar():
    con = _db()
    rows = con.execute("SELECT * FROM orders ORDER BY updated_at DESC LIMIT 20").fetchall()
    con.close()
    return {"orders": [_row_to_dict(r) for r in rows]}
