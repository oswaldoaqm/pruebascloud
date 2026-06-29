#!/bin/bash
# Demo multi-nube en un comando: pedido entra por OCI (Rappi) → AWS → estado de vuelta a OCI.
# Uso (desde la VM de AWS): bash scripts/demo-multinube.sh
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/config.sh"; source "$DIR/lib.sh"

hdr "DEMO MULTI-NUBE — AWS ↔ OCI (Rappi)"

# Pre-check: OCI accesible
if ! curl -s -m 6 "$OCI_BASE:8000/" | grep -q '"ok"' || ! curl -s -m 6 "$OCI_BASE:8001/" | grep -q '"ok"'; then
  bad "OCI no responde. En la VM de OCI: docker start rappi-status rappi-ingest"; exit 1
fi
ok "OCI arriba (ingest :8000 y status :8001)"

TK=$(login cocinero@pj.com); TKD=$(login despachador@pj.com); TKR=$(login repartidor@pj.com)

# 1) El pedido ENTRA por OCI
OID=$(curl -s -X POST "$OCI_BASE:8000/orders" -H "Content-Type: application/json" \
  -d "{\"tenant_id\":\"$TENANT\",\"items\":[{\"product_id\":\"pz-superpapa\",\"cant\":1}],\"cliente\":{\"nombre\":\"Demo TA\"}}" \
  | jget order_id)
[ -n "$OID" ] && ok "Pedido creado DESDE OCI (Rappi): #$OID" || { bad "OCI ingest no creó el pedido"; summary; exit 1; }
sleep 6

# 2) AWS lo registró con origin=RAPPI
ORIGIN=$(curl -s "$BASE/pedidos/$OID" -H "Authorization: Bearer $TK" | jget origin)
[ "$ORIGIN" = "RAPPI" ] && ok "AWS registró el pedido con origin=RAPPI" || bad "origin='$ORIGIN' (esperaba RAPPI)"

# 3) Cada paso en AWS se refleja en OCI
adv() {
  curl -s -X POST "$BASE/tareas/$OID/$1/tomar" -H "Authorization: Bearer $2" >/dev/null; sleep 1
  curl -s -X POST "$BASE/tareas/$OID/$1/completar" -H "Authorization: Bearer $2" >/dev/null; sleep 5
  local st; st=$(curl -s "$OCI_BASE:8001/orders/$OID" | jget status)
  echo -e "   ${GRN}tras $1 → estado en OCI: $st${NC}"
}
adv COCINAR "$TK"; adv EMPACAR "$TKD"; adv REPARTIR "$TKR"; adv ENTREGAR "$TKR"

ST=$(curl -s "$OCI_BASE:8001/orders/$OID" | jget status)
[ "$ST" = "DELIVERED" ] && ok "Ciclo completo: estado final en OCI = DELIVERED" || bad "Estado final en OCI = '$ST'"

echo -e "\n${BLU}Historial completo en OCI:${NC}"
curl -s "$OCI_BASE:8001/orders/$OID"; echo
summary
