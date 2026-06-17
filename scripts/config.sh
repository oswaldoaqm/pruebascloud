#!/bin/bash
# ────────────────────────────────────────────────────────────────────────────
# Configuración ÚNICA de la suite de pruebas. Edita estos 4 valores y listo.
# Todos los scripts de scripts/ leen de aquí.
# ────────────────────────────────────────────────────────────────────────────
CFG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export BASE="https://i9m3hyluue.execute-api.us-east-1.amazonaws.com"  # API Gateway (la del 'sls deploy')
export OCI_BASE="http://163.192.123.104"                              # VM OCI (Rappi): ingest :8000, status :8001
export TENANT="pj-miraflores"                                         # sede para las pruebas
export PASS="123456"                                                  # contraseña demo

# RAPPI_KEY: se lee automáticamente de backend/shared-config.yml (gitignored) si existe.
export RAPPI_KEY="$(grep -E '^rappiApiKey:' "$CFG_DIR/../backend/shared-config.yml" 2>/dev/null | awk '{print $2}' | tr -d '"'"'"' ')"
[ -z "$RAPPI_KEY" ] && export RAPPI_KEY="rappi-CAMBIAME"
