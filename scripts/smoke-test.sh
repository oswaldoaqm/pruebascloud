#!/bin/bash
# Smoke test end-to-end: crea usuarios demo (si no existen), un pedido,
# recorre todo el workflow y verifica que termine en DELIVERED.
# Uso: bash scripts/smoke-test.sh
set -u

# Backend consolidado: UNA sola API Gateway para todo. Reemplazar tras el deploy.
BASE=https://i9m3hyluue.execute-api.us-east-1.amazonaws.com
URL_USU=$BASE
URL_PED=$BASE
URL_WF=$BASE
TENANT=pj-miraflores
PASS=123456

red() { echo -e "\033[31m$1\033[0m"; }
green() { echo -e "\033[32m$1\033[0m"; }

reg() { # email nombre role (ignora error si ya existe)
  curl -s -X POST $URL_USU/auth/register -H "Content-Type: application/json" \
    -d "{\"tenant_id\":\"$TENANT\",\"email\":\"$1\",\"password\":\"$PASS\",\"nombre\":\"$2\",\"role\":\"$3\"}" > /dev/null
}

login() {
  curl -s -X POST $URL_USU/auth/login -H "Content-Type: application/json" \
    -d "{\"tenant_id\":\"$TENANT\",\"email\":\"$1\",\"password\":\"$PASS\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))"
}

paso() { # order_id paso token
  curl -s -X POST $URL_WF/tareas/$1/$2/tomar -H "Authorization: Bearer $3" > /dev/null
  sleep 1
  curl -s -X POST $URL_WF/tareas/$1/$2/completar -H "Authorization: Bearer $3" > /dev/null
  sleep 3  # dar tiempo a SFN de escribir el siguiente task token
  echo "  ✓ $2"
}

echo "== 1. Usuarios demo =="
reg cocinero@pj.com Mario COCINERO
reg despachador@pj.com Lucia DESPACHADOR
reg repartidor@pj.com Pedro REPARTIDOR
TK_COC=$(login cocinero@pj.com); TK_DES=$(login despachador@pj.com); TK_REP=$(login repartidor@pj.com)
[ -z "$TK_COC" ] && { red "FALLO: login"; exit 1; }
green "  ✓ logins OK"

echo "== 2. Crear pedido =="
OID=$(curl -s -X POST $URL_PED/pedidos -H "Authorization: Bearer $TK_COC" -H "Content-Type: application/json" \
  -d '{"items":[{"product_id":"pz-pepperoni","nombre":"Pepperoni","precio":39.90,"cant":1}]}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('order_id',''))")
[ -z "$OID" ] && { red "FALLO: crear pedido"; exit 1; }
green "  ✓ pedido $OID"
sleep 5  # EventBridge → start_workflow → primer task token

echo "== 3. Workflow completo =="
paso $OID COCINAR "$TK_COC"
paso $OID EMPACAR "$TK_DES"
paso $OID REPARTIR "$TK_REP"
paso $OID ENTREGAR "$TK_REP"
sleep 3

echo "== 4. Verificación =="
STATUS=$(curl -s $URL_PED/pedidos/$OID -H "Authorization: Bearer $TK_COC" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('status',''))")
if [ "$STATUS" = "DELIVERED" ]; then
  green "PASS ✅  Pedido $OID terminó en DELIVERED. Sistema operativo de punta a punta."
else
  red "FAIL ❌  Pedido $OID quedó en '$STATUS'. Revisa la ejecución en Step Functions."
  exit 1
fi
