#!/bin/bash
# E2E (camino feliz): crea un pedido WEB y lo lleva por todo el workflow hasta DELIVERED.
# Uso: bash scripts/smoke-test.sh   (requiere seedUsuarios y seedProductos)
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/config.sh"; source "$DIR/lib.sh"

hdr "E2E — pedido WEB de punta a punta"

TK_COC=$(login cocinero@pj.com); TK_DES=$(login despachador@pj.com); TK_REP=$(login repartidor@pj.com)
[ -n "$TK_COC" ] && [ -n "$TK_DES" ] && [ -n "$TK_REP" ] && ok "Login de los 3 roles" \
  || { bad "Login falló (¿seedUsuarios?)"; summary; exit 1; }

OID=$(curl -s -X POST "$BASE/pedidos" -H "Authorization: Bearer $TK_COC" -H "Content-Type: application/json" \
  -d '{"items":[{"product_id":"pz-pepperoni","cant":1}]}' | jget order_id)
[ -n "$OID" ] && ok "Pedido creado: #$OID" || { bad "No se pudo crear el pedido"; summary; exit 1; }
sleep 5  # EventBridge → start_workflow → primer task token

paso() { # order_id paso token
  curl -s -X POST "$BASE/tareas/$1/$2/tomar" -H "Authorization: Bearer $3" >/dev/null
  sleep 1
  local r; r=$(curl -s -X POST "$BASE/tareas/$1/$2/completar" -H "Authorization: Bearer $3" | jget message)
  sleep 3
  [ -n "$r" ] && ok "Paso $2 completado" || bad "Paso $2 no se completó"
}
paso "$OID" COCINAR  "$TK_COC"
paso "$OID" EMPACAR  "$TK_DES"
paso "$OID" REPARTIR "$TK_REP"
paso "$OID" ENTREGAR "$TK_REP"
sleep 3

STATUS=$(curl -s "$BASE/pedidos/$OID" -H "Authorization: Bearer $TK_COC" | jget status)
[ "$STATUS" = "DELIVERED" ] && ok "Pedido #$OID en DELIVERED (EDA + Step Functions OK)" \
  || bad "Pedido #$OID quedó en '$STATUS' (revisa Step Functions)"

summary
