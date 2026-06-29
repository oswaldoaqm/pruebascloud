"""API-1 'Rappi Ingest' (OCI, contenedor Docker).
Simula a Rappi: recibe un pedido, gatilla el Flujo de Trabajo en AWS
(POST /pedidos/rappi) y registra el pedido en la API de estado (API-2).
"""
import os

import requests
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

AWS_PEDIDOS_URL = os.environ["AWS_PEDIDOS_URL"]  # https://xxxx.execute-api.us-east-1.amazonaws.com
API_KEY = os.environ["API_KEY"]                  # misma rappiApiKey que conoce AWS
STATUS_URL = os.environ["STATUS_URL"]            # http://<IP_PRIVADA_VM>:8001

app = FastAPI(title="Rappi Ingest API")
# CORS abierto: la web de demo (servida aquí) consulta la API de estado en otro puerto.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class Pedido(BaseModel):
    tenant_id: str
    items: list
    cliente: dict = {"nombre": "Cliente Rappi"}


@app.get("/")
def health():
    return {"service": "rappi-ingest", "ok": True}


@app.get("/ui")
def ui():
    """Web de demo 'Rappi' (sin login) alojada en OCI."""
    return FileResponse("static/index.html")


@app.post("/orders", status_code=201)
def crear_pedido(pedido: Pedido):
    # 1. Gatillar el workflow en AWS
    try:
        r = requests.post(
            f"{AWS_PEDIDOS_URL}/pedidos/rappi",
            json={"tenant_id": pedido.tenant_id, "items": pedido.items, "cliente": pedido.cliente},
            headers={"x-api-key": API_KEY},
            timeout=10,
        )
        body = r.json()
    except Exception as e:
        return {"error": f"No se pudo contactar a AWS: {e}"}

    if r.status_code != 201:
        return body

    order_id = body["order_id"]

    # 2. Registrar el pedido en 'Rappi' (API-2 / SQLite)
    try:
        requests.post(
            f"{STATUS_URL}/orders",
            json={"order_id": order_id, "tenant_id": pedido.tenant_id,
                  "cliente": pedido.cliente, "items": pedido.items, "total": body.get("total")},
            headers={"x-api-key": API_KEY},
            timeout=5,
        )
    except Exception as e:
        print(f"Advertencia: no se pudo registrar en API-2: {e}")

    return {"message": "Pedido enviado al restaurante", "order_id": order_id,
            "status": "RECEIVED", "total": body.get("total")}
