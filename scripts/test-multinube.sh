#!/bin/bash
# MULTI-NUBE: pedido entrando por OCI (Rappi) → AWS → workflow → de vuelta a OCI.
# Si OCI no es accesible desde aquí, OMITE las pruebas (no falla la suite).
# Uso: bash scripts/test-multinube.sh
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/config.sh"; source "$DIR/lib.sh"

hdr "MULTI-NUBE — AWS ↔ OCI (Rappi)"

if ! curl -s -m 6 "$OCI_BASE:8000/" | grep -q '"ok"'; then
  skip "OCI no accesible desde esta red — corre este script desde la VM/Cloud Shell de OCI"
  summary; exit 0
fi

# 1. Crear pedido desde OCI (Rappi) → gatilla el workflow en AWS
OID=$(curl -s -X POST "$OCI_BASE:8000/orders" -H "Content-Type: application/json" \
  -d "{\"tenant_id\":\"$TENANT\",\"items\":[{\"product_id\":\"pz-hawaiana\",\"cant\":1}],\"cliente\":{\"nombre\":\"QA Rappi\"}}" | jget order_id)
[ -n "$OID" ] && ok "OCI ingest creó el pedido #$OID en AWS" || { bad "OCI ingest no creó el pedido"; summary; exit 1; }
sleep 5

# 2. AWS conoce el pedido y su origen es RAPPI
TK=$(login cocinero@pj.com)
ORIGIN=$(curl -s "$BASE/pedidos/$OID" -H "Authorization: Bearer $TK" | jget origin)
[ "$ORIGIN" = "RAPPI" ] && ok "AWS registró el pedido con origin=RAPPI" || bad "origin esperado RAPPI, obtuvo '$ORIGIN'"

# 3. OCI ya tiene el pedido (registro inicial ingest→status)
ST=$(curl -s "$OCI_BASE:8001/orders/$OID" | jget status)
[ -n "$ST" ] && ok "OCI status conoce el pedido (estado: $ST)" || bad "OCI status no tiene el pedido"

# 4. Recorrer el workflow y verificar que AWS notifica a OCI en cada paso
TK_DES=$(login despachador@pj.com); TK_REP=$(login repartidor@pj.com)
adv() { curl -s -X POST "$BASE/tareas/$OID/$1/tomar" -H "Authorization: Bearer $2" >/dev/null; sleep 1
        curl -s -X POST "$BASE/tareas/$OID/$1/completar" -H "Authorization: Bearer $2" >/dev/null; sleep 3; }
adv COCINAR "$TK"; adv EMPACAR "$TK_DES"; adv REPARTIR "$TK_REP"; adv ENTREGAR "$TK_REP"; sleep 3

ST=$(curl -s "$OCI_BASE:8001/orders/$OID" | jget status)
[ "$ST" = "DELIVERED" ] && ok "AWS→OCI: estado en Rappi llegó a DELIVERED (notificación por paso OK)" \
  || bad "Estado en OCI quedó en '$ST' (se esperaba DELIVERED)"

# 5. Cancelación de un pedido Rappi también se refleja en OCI
OID2=$(curl -s -X POST "$OCI_BASE:8000/orders" -H "Content-Type: application/json" \
  -d "{\"tenant_id\":\"$TENANT\",\"items\":[{\"product_id\":\"pz-cheese\",\"cant\":1}],\"cliente\":{\"nombre\":\"QA Cancel\"}}" | jget order_id)
sleep 5
curl -s -X POST "$BASE/pedidos/$OID2/cancelar" -H "Authorization: Bearer $TK" >/dev/null
sleep 4
ST=$(curl -s "$OCI_BASE:8001/orders/$OID2" | jget status)
[ "$ST" = "FAILED" ] && ok "Cancelación de pedido Rappi #$OID2 reflejada en OCI (FAILED)" \
  || bad "Cancelación: estado en OCI = '$ST' (se esperaba FAILED)"

summary
