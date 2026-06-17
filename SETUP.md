# Guía rápida de sesión

El despliegue **desde cero** está documentado en `README.md` (AWS, OCI y Amplify).
Este archivo es la **rutina de cada sesión de trabajo** y el checklist de "¿está todo arriba?".

## 1. Reanudar el entorno AWS (cada sesión del Learner Lab)

Las credenciales del Learner Lab caducan (~4 h). Al volver:

```bash
# a) Iniciar el Lab (círculo verde) → AWS Details → AWS CLI → Show
#    Copiar TODO el bloque (incluye aws_session_token) en:
nano ~/.aws/credentials

# b) Verificar credenciales
aws sts get-caller-identity

# c) Validar que el sistema sigue operativo (suite QA completa)
cd ~/proyecto/pruebascloud
bash scripts/run-all.sh          # banner verde = todo OK
```

> Los recursos desplegados (Lambda, DynamoDB, Step Functions, S3, Amplify, EventBridge)
> **persisten** entre sesiones; lo único que expira son las credenciales del CLI.

## 2. Si modificas el backend

```bash
cd ~/proyecto/pruebascloud && git pull
cd backend && python3 -m py_compile *.py && echo "PY OK" && sls deploy && cd ..
bash scripts/smoke-test.sh
```

## 3. Si modificas el frontend

Tras `git push`, Amplify reconstruye solo. Para validar antes (o en local):

```bash
cd frontend/web-clientes      && npm run build && cd ../..
cd frontend/web-trabajadores  && npm run build && cd ../..
```

Si el navegador muestra una versión vieja, haz **hard refresh** (Ctrl/Cmd + Shift + R).

## 4. OCI (Rappi) — si la VM se reinició

```bash
ssh -i <llave>.key opc@<IP_OCI>
docker start rappi-status rappi-ingest
docker ps                         # ambos en Up
curl http://localhost:8000/ && curl http://localhost:8001/   # "ok": true
```
(Con el cron `@reboot` configurado, esto ocurre solo tras un reinicio — ver `oci/README.md`.)

## 5. Recargar datos demo (si hiciera falta)

```bash
cd backend
sls invoke -f seedSedes        # 4 sedes
sls invoke -f seedProductos    # catálogo
sls invoke -f seedUsuarios     # 45 cuentas (11 por sede + superadmin)
```

## Antes de una exposición/demo
- Renovar credenciales y correr `bash scripts/run-all.sh` (debe dar verde).
- Confirmar que la VM de OCI y sus 2 contenedores están arriba.
- **Hard refresh** en ambas webs.
- Si presentas desde la red de UTEC, los puertos 8000/8001 de OCI pueden estar bloqueados para el
  navegador: muestra la evidencia de "Rappi" con `curl` desde Cloud Shell o usa hotspot.
- URLs y credenciales demo: ver `README.md`.
