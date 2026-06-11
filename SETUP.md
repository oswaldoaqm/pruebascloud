# Guía rápida de sesión (AWS Learner Lab)

El despliegue completo desde cero está en `README.md`. Esto es lo que se repite **en cada sesión** de trabajo:

```bash
# 1. Iniciar el Learner Lab (círculo verde) y renovar credenciales:
#    AWS Details → AWS CLI → Show → copiar TODO el bloque en:
nano ~/.aws/credentials

# 2. Verificar
aws sts get-caller-identity

# 3. Validar que el sistema sigue operativo de punta a punta
cd ~/proyecto/pruebascloud && bash scripts/smoke-test.sh   # → PASS ✅
```

Notas:
- Los recursos desplegados (Lambda, DynamoDB, SFN, Amplify) **persisten** entre sesiones; solo expiran las credenciales (~4h).
- Si la VM de OCI se reinició: `ssh` a ella y `docker start rappi-status rappi-ingest`.
- URLs y credenciales demo: ver `README.md`.
