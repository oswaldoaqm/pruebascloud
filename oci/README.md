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
AWS_URL=<URL de ms-pedidos en AWS>

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
curl http://localhost:8000/   # {"service":"rappi-ingest","ok":true}
curl http://localhost:8001/   # {"service":"rappi-status","ok":true}
```

Notas: en `docker build`, si pregunta por la imagen, elegir `docker.io/library/python:3.12-slim`.
Si la VM se reinicia: `docker start rappi-status rappi-ingest`.
Algunas redes locales (ej. wifi institucional) bloquean los puertos 8000/8001: probar desde Cloud Shell o hotspot.

## Conexión AWS → OCI

En la VM de AWS, agregar a `backend/shared-config.yml`:

```yaml
rappiStatusUrl: 'http://<IP_PUBLICA_OCI>:8001'
```

y redesplegar: `cd backend/ms-workflow && sls deploy`.

## Prueba end-to-end multi-nube

```bash
# 1. Pedido "desde Rappi" → OCI → AWS → workflow
curl -X POST http://<IP_PUBLICA_OCI>:8000/orders -H "Content-Type: application/json" \
  -d '{"tenant_id":"pj-miraflores","items":[{"product_id":"pz-pepperoni","nombre":"Pepperoni","precio":39.90,"cant":1}],"cliente":{"nombre":"Juan Rappi"}}'

# 2. Atenderlo en la web de trabajadores (badge naranja RAPPI)…

# 3. Ver el estado actualizado "en Rappi" con el historial de pasos
curl http://<IP_PUBLICA_OCI>:8001/orders/<ORDER_ID>
```
