# Suite de verificación (QA)

Scripts para comprobar que el sistema quedó **bien levantado** tras un despliegue.
Pensados para que cualquier integrante del grupo valide en minutos, sin conocer el detalle interno.

## Requisitos
- Ejecutar desde la **VM de AWS** (con credenciales del Learner Lab renovadas).
- Haber corrido: `sls deploy`, `sls invoke -f seedProductos`, `sls invoke -f seedUsuarios`.
- Python 3 y `curl` (ya vienen en la VM).

## Configuración (una sola vez)
Edita `scripts/config.sh` y verifica que `BASE` (URL de la API Gateway) y `OCI_BASE` (IP de la VM OCI) sean los actuales. La `RAPPI_KEY` se lee sola de `backend/shared-config.yml`.

## Uso

```bash
# Todo de una vez (recomendado)
bash scripts/run-all.sh

# O por bloques:
bash scripts/check-health.sh    # 1) salud, conectividad y que las URLs sean correctas
bash scripts/smoke-test.sh      # 2) pedido WEB de punta a punta (→ DELIVERED)
bash scripts/test-security.sh   # 3) RBAC, anti-escalada y precio del servidor
bash scripts/test-multinube.sh  # 4) AWS ↔ OCI (Rappi) + cancelación

# Demo en vivo del flujo multi-nube (para presentar, 1 comando):
bash scripts/demo-multinube.sh
```

`run-all.sh` ejecuta los bloques 1-4 (no incluye `demo-multinube.sh`, que es solo para presentación).

## Qué valida cada uno

| Script | Verifica |
|---|---|
| `check-health` | Credenciales AWS, API viva (`/sedes`, `/productos`), login, que un endpoint protegido exija token, salud de OCI y que el `config.js` del frontend apunte a la API correcta. |
| `smoke-test` | Crear pedido WEB → cocinar → empacar → repartir → entregar → `DELIVERED` (EDA + Step Functions + Task Token). |
| `test-security` | Login con clave mala (401), registro no permite auto-ADMIN, cocinero no entra a `/usuarios` (403), admin no ve métricas de cadena (403), superadmin sí (200), precio no manipulable. |
| `test-multinube` | Pedido entra por OCI → AWS lo registra (origin RAPPI) → workflow → el estado vuelve a OCI; cancelación reflejada en OCI. Se **omite** si OCI no es accesible desde la red actual. |
| `demo-multinube` | Igual que el anterior pero en modo **presentación** (un comando, salida narrada): crea el pedido en OCI, lo avanza paso a paso y muestra el estado actualizándose en OCI. No es parte de `run-all`. |

## Lectura del resultado
Cada script imprime `✓` (ok), `✗` (fallo) o `∼` (omitido) y un resumen `N OK, N fallos, N omitidos`. `run-all.sh` termina con un banner verde si todo pasó. Código de salida `0` = todo bien.

> Nota: desde la red de la universidad los puertos 8000/8001 de OCI suelen estar bloqueados; en ese caso `test-multinube` se **omite** (no es un fallo del sistema). Córrelo desde la Cloud Shell de OCI para validar la parte multi-nube.
