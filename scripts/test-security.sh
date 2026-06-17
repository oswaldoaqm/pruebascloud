#!/bin/bash
# Seguridad / RBAC: valida las protecciones y los fixes (no escalada, precio servidor).
# Uso: bash scripts/test-security.sh
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/config.sh"; source "$DIR/lib.sh"

hdr "SEGURIDAD — RBAC y anti-escalada"

# 1. Login con contraseña incorrecta → rechazado
C=$(httpcode -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d "{\"tenant_id\":\"$TENANT\",\"email\":\"cocinero@pj.com\",\"password\":\"malformada\"}")
[ "$C" = "401" ] && ok "Login con contraseña errónea → 401" || bad "Login débil: esperaba 401, obtuvo $C"

# 2. Registro público NO permite auto-asignarse ADMIN (debe quedar CLIENTE)
EMAIL="qa+$(date +%s)@pj.com"
ROLE=$(curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" \
  -d "{\"tenant_id\":\"$TENANT\",\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"nombre\":\"QA\",\"role\":\"ADMIN\"}" | jget role)
[ "$ROLE" = "CLIENTE" ] && ok "Registro público con role=ADMIN → creado como CLIENTE" \
  || bad "Escalada de privilegios: registro devolvió role='$ROLE'"

# 3. Trabajador (cocinero) NO puede acceder a endpoints de ADMIN
TK_COC=$(login cocinero@pj.com)
C=$(httpcode "$BASE/usuarios" -H "Authorization: Bearer $TK_COC")
[ "$C" = "403" ] && ok "Cocinero → GET /usuarios = 403 (solo ADMIN)" || bad "RBAC: cocinero obtuvo $C en /usuarios"

# 4. ADMIN de sede NO puede ver métricas de cadena (solo SUPERADMIN)
TK_ADM=$(login admin@pj.com)
C=$(httpcode "$BASE/sedes/metricas" -H "Authorization: Bearer $TK_ADM")
[ "$C" = "403" ] && ok "Admin → GET /sedes/metricas = 403 (solo SUPERADMIN)" || bad "RBAC: admin obtuvo $C en métricas"

# 5. SUPERADMIN sí accede a métricas de cadena
TK_SUP=$(login superadmin@pj.com pj-central)
C=$(httpcode "$BASE/sedes/metricas" -H "Authorization: Bearer $TK_SUP")
[ "$C" = "200" ] && ok "Superadmin → GET /sedes/metricas = 200" || bad "Superadmin no accede a métricas (HTTP $C)"

# 6. Precio NO manipulable: enviar precio 0.01 debe ignorarse (usa el del catálogo)
OID=$(curl -s -X POST "$BASE/pedidos" -H "Authorization: Bearer $TK_COC" -H "Content-Type: application/json" \
  -d '{"items":[{"product_id":"pz-pepperoni","nombre":"hack","precio":0.01,"cant":1}]}' | jget order_id)
if [ -n "$OID" ]; then
  TOTAL=$(curl -s "$BASE/pedidos/$OID" -H "Authorization: Bearer $TK_COC" | jget total)
  awk "BEGIN{exit !($TOTAL > 1)}" && ok "Precio tomado del catálogo (total=$TOTAL, no 0.01)" \
    || bad "Precio manipulable: total=$TOTAL"
  # limpieza: cancelar el pedido de prueba
  curl -s -X POST "$BASE/pedidos/$OID/cancelar" -H "Authorization: Bearer $TK_COC" >/dev/null
else
  bad "No se pudo crear el pedido de prueba de precio"
fi

summary
