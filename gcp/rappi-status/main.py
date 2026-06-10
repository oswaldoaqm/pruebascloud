"""API-2 'Rappi Status' (GCP Cloud Run function).
AWS la invoca en cada paso del workflow (Lambda notify_rappi vía EventBridge)
para actualizar el estado del pedido 'en Rappi' (Firestore).

POST /            {order_id, tenant_id, paso, status_pedido}   (header x-api-key)
GET  /orders/{id} → estado e historial del pedido
GET  /orders      → últimos 20 pedidos (evidencia para la demo)
"""
import os
from datetime import datetime, timezone

from google.cloud import firestore

db = firestore.Client()
API_KEY = os.environ["API_KEY"]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def main(request):
    if request.method == "POST":
        if request.headers.get("x-api-key") != API_KEY:
            return ({"error": "x-api-key inválida"}, 401)

        d = request.get_json(silent=True) or {}
        order_id = d.get("order_id")
        status = d.get("status_pedido")
        if not order_id or not status:
            return ({"error": "order_id y status_pedido son requeridos"}, 400)

        doc = db.collection("orders").document(order_id)
        doc.set({
            "order_id": order_id,
            "tenant_id": d.get("tenant_id"),
            "status": status,
            "updated_at": _now(),
        }, merge=True)
        doc.update({"history": firestore.ArrayUnion([
            {"paso": d.get("paso", "?"), "status": status, "ts": _now()}
        ])})
        return ({"ok": True, "order_id": order_id, "status": status}, 200)

    # GET (público, solo lectura — evidencia para la demo)
    parts = [p for p in (request.path or "/").split("/") if p]
    if len(parts) == 2 and parts[0] == "orders":
        snap = db.collection("orders").document(parts[1]).get()
        if not snap.exists:
            return ({"error": "Pedido no encontrado en Rappi"}, 404)
        return (snap.to_dict(), 200)

    docs = (db.collection("orders")
            .order_by("updated_at", direction=firestore.Query.DESCENDING)
            .limit(20).stream())
    return ({"orders": [x.to_dict() for x in docs]}, 200)
