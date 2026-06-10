"""API-1 'Rappi Ingest' (GCP Cloud Run function).
Simula a Rappi: recibe un pedido, lo registra en Firestore y gatilla
el Flujo de Trabajo en AWS llamando a POST /pedidos/rappi.
"""
import os
from datetime import datetime, timezone

import requests
from google.cloud import firestore

db = firestore.Client()
AWS_PEDIDOS_URL = os.environ["AWS_PEDIDOS_URL"]  # ej: https://xxxx.execute-api.us-east-1.amazonaws.com
API_KEY = os.environ["API_KEY"]                  # misma rappiApiKey que conoce AWS


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def main(request):
    if request.method != "POST":
        return ({"error": "Usar POST con JSON {tenant_id, items, cliente}"}, 405)

    data = request.get_json(silent=True) or {}
    tenant_id = data.get("tenant_id", "").strip()
    items = data.get("items")
    cliente = data.get("cliente", {"nombre": "Cliente Rappi"})

    if not tenant_id or not items:
        return ({"error": "tenant_id e items son requeridos"}, 400)

    # 1. Gatillar el workflow en AWS
    try:
        r = requests.post(
            f"{AWS_PEDIDOS_URL}/pedidos/rappi",
            json={"tenant_id": tenant_id, "items": items, "cliente": cliente},
            headers={"x-api-key": API_KEY},
            timeout=10,
        )
        body = r.json()
    except Exception as e:
        return ({"error": f"No se pudo contactar a AWS: {e}"}, 502)

    if r.status_code != 201:
        return (body, r.status_code)

    order_id = body["order_id"]

    # 2. Registrar el pedido en 'Rappi' (Firestore)
    db.collection("orders").document(order_id).set({
        "order_id": order_id,
        "tenant_id": tenant_id,
        "cliente": cliente,
        "items": items,
        "total": body.get("total"),
        "status": "RECEIVED",
        "created_at": _now(),
        "updated_at": _now(),
        "history": [{"paso": "PEDIDO_CREADO", "status": "RECEIVED", "ts": _now()}],
    })

    return ({"message": "Pedido enviado al restaurante", "order_id": order_id,
             "status": "RECEIVED", "total": body.get("total")}, 201)
