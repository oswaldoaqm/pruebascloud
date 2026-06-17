#!/bin/bash
# Runner maestro: ejecuta toda la suite de verificación en orden y resume.
# Uso: bash scripts/run-all.sh
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BLU='\033[36m'; GRN='\033[32m'; RED='\033[31m'; NC='\033[0m'

echo -e "${BLU}╔══════════════════════════════════════════════════╗"
echo -e "║   Suite de verificación — Papa Johns (Grupo 2)   ║"
echo -e "╚══════════════════════════════════════════════════╝${NC}"

FALLOS=0
for s in check-health smoke-test test-security test-multinube; do
  bash "$DIR/$s.sh" || FALLOS=$((FALLOS+1))
done

echo
if [ "$FALLOS" -eq 0 ]; then
  echo -e "${GRN}██ TODO OK — el sistema está levantado y operativo de punta a punta ██${NC}"
else
  echo -e "${RED}██ $FALLOS bloque(s) con fallos — revisa el detalle arriba ██${NC}"
fi
exit "$FALLOS"
