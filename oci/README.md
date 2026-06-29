# Integración OCI — APIs "Rappi" (multi-nube)

Dos APIs REST (FastAPI) en contenedores Docker sobre una VM de OCI, con SQLite como BD de "Rappi".
API-1 `rappi-ingest` (puerto **8000**) gatilla el workflow en AWS; API-2 `rappi-status` (puerto **8001**) recibe los cambios de estado desde AWS.

## Infraestructura (consola OCI, según guía de clase)

1. Compartment `lab-oci`, VCN `vcn-lab` con subred pública (VCN Wizard).
2. Security List de la VCN → **Ingress Rules**: TCP 0.0.0.0/0 → puertos **8000** y **8001**.
3. VM `vm-rappi`: Oracle Linux 9, shape VM.Standard.A2.Flex, subred pública, IP pública automática, descargar llave SSH.

## Despliegue (Cloud Shell de OCI)

```bash
chmod 600 <llave>.key
ssh -i <llave>.key opc@<IP_PUBLICA>

# Dentro de la VM:
sudo dnf install -y docker git
sudo loginctl enable-linger opc   # que los contenedores sobrevivan al cerrar la sesión SSH
git clone https://github.com/oswaldoaqm/pruebascloud.git && cd pruebascloud

# Variables (usar los valores reales)
RAPPI_KEY=<rappiApiKey de shared-config.yml>
AWS_URL=<URL de la API Gateway en AWS, la del 'sls deploy'>

# Red compartida (podman rootless no permite contenedor→IP del host; por nombre sí)
docker network create rappi-net

# API-2 (status) primero
cd oci/rappi-status && docker build -t rappi-status . && cd ../..
docker run -d --name rappi-status --network rappi-net -p 8001:8000 \
  -e API_KEY=$RAPPI_KEY rappi-status

# API-1 (ingest)
cd oci/rappi-ingest && docker build -t rappi-ingest . && cd ../..
docker run -d --name rappi-ingest --network rappi-net -p 8000:8000 \
  -e API_KEY=$RAPPI_KEY -e AWS_PEDIDOS_URL=$AWS_URL \
  -e STATUS_URL=http://rappi-status:8000 rappi-ingest

# Firewall del SO
sudo firewall-cmd --permanent --add-port=8000/tcp --add-port=8001/tcp
sudo firewall-cmd --reload

# Verificar
curl http://localhost:8000/      # {"service":"rappi-ingest","ok":true}
curl http://localhost:8001/      # {"service":"rappi-status","ok":true}
curl http://localhost:8000/ui    # HTML de la web de demo
```

Notas: en `docker build`, si pregunta por la imagen, elegir `docker.io/library/python:3.12-slim`.
Si la VM se reinicia: `docker start rappi-status rappi-ingest` (o el cron `@reboot`, abajo).
Algunas redes locales (ej. wifi institucional) bloquean los puertos 8000/8001: probar desde Cloud Shell o hotspot.
Auto-arranque tras reinicio: `(crontab -l 2>/dev/null; echo "@reboot sleep 20 && /usr/bin/docker start rappi-status rappi-ingest") | crontab -`

## Web de demo "Rappi" (sin login)

El contenedor `rappi-ingest` sirve una página web en **`http://<IP_PUBLICA_OCI>:8000/ui`** (el `Dockerfile`
copia `oci/rappi-ingest/static/index.html`). Permite elegir una pizza y pedir **sin login**, y muestra el
estado del pedido avanzando en vivo (leído desde la API-2). Ambos contenedores tienen **CORS** habilitado
para que la página (puerto 8000) pueda consultar el estado (puerto 8001).

Sirve para presentar el flujo multi-nube en el navegador: pides en la web de Rappi (OCI), lo atiendes en la
consola de trabajadores (AWS/Amplify) y el estado vuelve a la web de Rappi en tiempo real.

## Conexión AWS → OCI

En la VM de AWS, agregar a `backend/shared-config.yml`:

```yaml
rappiStatusUrl: 'http://<IP_PUBLICA_OCI>:8001'
```

y redesplegar: `cd backend && sls deploy`. (En AWS, EventBridge → **SQS** → `notify_rappi` llama a la API-2.)

## Prueba end-to-end multi-nube

```bash
# 1. Pedido "desde Rappi" → OCI → AWS → workflow
#    (basta product_id + cant; el precio y el nombre los toma AWS del catálogo)
curl -X POST http://<IP_PUBLICA_OCI>:8000/orders -H "Content-Type: application/json" \
  -d '{"tenant_id":"pj-miraflores","items":[{"product_id":"pz-pepperoni","cant":1}],"cliente":{"nombre":"Juan Rappi"}}'

# 2. Atenderlo en la web de trabajadores (badge naranja RAPPI)…

# 3. Ver el estado actualizado "en Rappi" con el historial de pasos
curl http://<IP_PUBLICA_OCI>:8001/orders/<ORDER_ID>
```
