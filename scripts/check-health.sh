#!/bin/bash
# PREFLIGHT: verifica que todo esté levantado y que las URLs sean correctas.
# Solo lectura (no crea ni modifica datos). Uso: bash scripts/check-health.sh
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/config.sh"; source "$DIR/lib.sh"

hdr "PREFLIGHT — salud, conectividad y URLs"

# 1. Credenciales AWS
aws sts get-caller-identity >/dev/null 2>&1 && ok "Credenciales AWS válidas" \
  || bad "AWS CLI sin credenciales (renueva el Learner Lab)"

# 2. API Gateway viva (endpoint público)
N=$(curl -s -m 10 "$BASE/sedes" | python3 -c "import sys,json;print(len(json.load(sys.stdin).get('sedes',[])))" 2>/dev/null)
{ [ -n "$N" ] && [ "$N" -ge 1 ]; } 2>/dev/null && ok "API responde: GET /sedes ($N sedes activas)" \
  || bad "GET /sedes no devolvió sedes (¿BASE correcta? ¿corriste seedSedes?)"

# 3. Catálogo
P=$(curl -s "$BASE/productos?tenant_id=$TENANT" | jget count)
{ [ -n "$P" ] && [ "$P" -ge 1 ]; } 2>/dev/null && ok "Catálogo: $P productos en $TENANT" \
  || bad "GET /productos sin resultados (¿seedProductos?)"

# 4. Login de trabajador (valida seedUsuarios)
TK=$(login cocinero@pj.com)
[ -n "$TK" ] && ok "Login de trabajador OK" || bad "Login falló (¿corriste seedUsuarios?)"

# 5. Endpoint protegido rechaza sin token
C=$(httpcode "$BASE/usuarios")
[ "$C" != "200" ] && ok "Endpoint protegido exige token (HTTP $C sin Authorization)" \
  || bad "GET /usuarios respondió 200 SIN token (fallo de seguridad)"

# 6. OCI (multi-nube) — si la red lo bloquea, se OMITE (no es fallo del sistema)
if curl -s -m 6 "$OCI_BASE:8000/" | grep -q '"ok"'; then ok "OCI rappi-ingest arriba (:8000)"
else skip "OCI :8000 no accesible desde aquí (red/contenedor) — verifícalo desde Cloud Shell"; fi
if curl -s -m 6 "$OCI_BASE:8001/" | grep -q '"ok"'; then ok "OCI rappi-status arriba (:8001)"
else skip "OCI :8001 no accesible desde aquí"; fi

# 7. Consistencia de URLs: el frontend debe apuntar a BASE
H=$(echo "$BASE" | sed -E 's#https?://##')
grep -q "$H" "$DIR/../frontend/web-clientes/src/config.js" \
  && ok "web-clientes/config.js apunta a la API correcta" \
  || bad "web-clientes/config.js NO apunta a $H (URL desactualizada)"
grep -q "$H" "$DIR/../frontend/web-trabajadores/src/config.js" \
  && ok "web-trabajadores/config.js apunta a la API correcta" \
  || bad "web-trabajadores/config.js NO apunta a $H (URL desactualizada)"

summary
