#!/bin/bash
# Librería compartida: colores, aserciones, helpers HTTP/JSON y resumen.
RED='\033[31m'; GRN='\033[32m'; YEL='\033[33m'; BLU='\033[36m'; NC='\033[0m'
PASS_N=0; FAIL_N=0; SKIP_N=0

hdr()  { echo -e "\n${BLU}══ $1 ══${NC}"; }
ok()   { PASS_N=$((PASS_N+1)); echo -e "  ${GRN}✓${NC} $1"; }
bad()  { FAIL_N=$((FAIL_N+1)); echo -e "  ${RED}✗ $1${NC}"; }
skip() { SKIP_N=$((SKIP_N+1)); echo -e "  ${YEL}∼ (omitido) $1${NC}"; }

# jget <clave>  — extrae una clave de nivel superior del JSON que llega por stdin
jget() { python3 -c "import sys,json
try: print(json.load(sys.stdin).get('$1',''))
except Exception: print('')"; }

# httpcode <args-curl>  — devuelve solo el código HTTP
httpcode() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

# login <email> [tenant]  — devuelve el token (vacío si falla)
login() { curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d "{\"tenant_id\":\"${2:-$TENANT}\",\"email\":\"$1\",\"password\":\"$PASS\"}" | jget token; }

summary() {
  echo -e "\n${BLU}── Resumen: ${GRN}$PASS_N OK${NC}, ${RED}$FAIL_N fallos${NC}, ${YEL}$SKIP_N omitidos${NC} ──"
  [ "$FAIL_N" -eq 0 ]
}
