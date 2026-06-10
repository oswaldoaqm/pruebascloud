# Setup inicial — Paso 1 del plan (Día 1-2, Semana 1)

Objetivo: desplegar el "hola mundo" de `ms-usuarios` en AWS Learner Lab y validar todo el pipeline.

## 1. Instalar herramientas (una sola vez)

```bash
# Requiere Node.js 18+ (https://nodejs.org)
node -v

# Serverless Framework v3 (la v4 pide cuenta/licencia; la v3 no)
npm install -g serverless@3
sls -v
```

## 2. Credenciales del Learner Lab (REPETIR EN CADA SESIÓN)

Las credenciales del Learner Lab **expiran cada ~4 horas** (al cerrar el lab).

1. En AWS Academy: **Start Lab** → espera el círculo verde.
2. Clic en **AWS Details** → **Show** junto a "AWS CLI".
3. Copia el bloque completo (incluye `aws_session_token`) en el archivo
   `C:\Users\<tu_usuario>\.aws\credentials`:

```ini
[default]
aws_access_key_id=ASIA...
aws_secret_access_key=...
aws_session_token=...
```

4. Verifica:

```bash
aws sts get-caller-identity
```

## 3. Desplegar el hola mundo

```bash
cd backend/ms-usuarios
sls deploy
```

Al final verás un endpoint como:
`GET - https://xxxxx.execute-api.us-east-1.amazonaws.com/hello`

Pruébalo en el navegador o:

```bash
curl https://xxxxx.execute-api.us-east-1.amazonaws.com/hello
```

Si responde `{"message": "ms-usuarios desplegado correctamente", ...}` → pipeline validado. ✅
**Toma captura de pantalla** (consola Lambda + respuesta del endpoint) para el informe.

## 4. Notas importantes del Learner Lab

- **Región: siempre `us-east-1`** (ya fijada en serverless.yml).
- No se pueden crear roles IAM → todos los `serverless.yml` usan `LabRole` (ya configurado).
- Los recursos (Lambda, DynamoDB, etc.) **persisten** entre sesiones; solo las credenciales expiran.
- Verifica temprano que **Amplify Hosting** esté habilitado en tu Learner Lab (Services → Amplify). Si no lo está, avísame para ajustar la estrategia de frontend.

## 5. En paralelo (mismo día)

- [ ] Crear cuenta GCP y activar los US$300 de crédito (90 días): https://cloud.google.com/free
- [ ] Crear repositorio(s) GitHub **públicos** (el informe exige enlaces públicos).
- [ ] Subir este esqueleto al repo.

## Siguiente paso (Día 3-4)

Con el pipeline validado: tabla `t_usuarios` en DynamoDB + register/login con JWT + Lambda authorizer. Pídemelo y lo armamos.
