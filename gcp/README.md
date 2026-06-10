# Integración GCP — APIs "Rappi" (multi-nube)

Dos Cloud Run functions (Python) + Firestore. Todo se despliega desde **Cloud Shell**.

## Despliegue desde cero

```bash
# 1. Proyecto y APIs (una vez)
gcloud config set project <PROJECT_ID>
gcloud services enable run.googleapis.com cloudfunctions.googleapis.com \
  cloudbuild.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com

# 2. Firestore (una vez): base de datos Nativa en us-east1
gcloud firestore databases create --location=us-east1

# 3. Clonar el repo en Cloud Shell
git clone https://github.com/oswaldoaqm/pruebascloud.git && cd pruebascloud

# 4. API-2 (Rappi Status) — desplegar PRIMERO
gcloud functions deploy rappi-status --gen2 --runtime=python312 --region=us-east1 \
  --source=gcp/rappi-status --entry-point=main --trigger-http --allow-unauthenticated \
  --set-env-vars API_KEY=<rappiApiKey>

# 5. API-1 (Rappi Ingest)
gcloud functions deploy rappi-ingest --gen2 --runtime=python312 --region=us-east1 \
  --source=gcp/rappi-ingest --entry-point=main --trigger-http --allow-unauthenticated \
  --set-env-vars AWS_PEDIDOS_URL=<URL_MS_PEDIDOS>,API_KEY=<rappiApiKey>
```

`<rappiApiKey>` = el mismo valor de `backend/shared-config.yml`. Cada deploy imprime su URL (`https://...run.app`).

## Conexión AWS → GCP

En la VM de AWS: agregar a `backend/shared-config.yml` la URL de rappi-status:

```yaml
gcpStatusUrl: 'https://rappi-status-xxxxx-ue.a.run.app'
```

y redesplegar: `cd backend/ms-workflow && sls deploy`.

## Prueba end-to-end multi-nube

```bash
# Crear pedido "desde Rappi" (gatilla el workflow en AWS)
curl -X POST <URL_RAPPI_INGEST> -H "Content-Type: application/json" \
  -d '{"tenant_id":"pj-miraflores","items":[{"product_id":"pz-pepperoni","nombre":"Pepperoni","precio":39.90,"cant":1}],"cliente":{"nombre":"Juan Rappi"}}'

# Atender el pedido en la web de trabajadores (badge naranja RAPPI)…

# Ver el estado actualizado "en Rappi" (con historial de pasos)
curl <URL_RAPPI_STATUS>/orders/<ORDER_ID>
```

Evidencia adicional: consola GCP → Firestore → colección `orders`.
