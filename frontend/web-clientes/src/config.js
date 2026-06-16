// Toda la app usa UNA sola API Gateway (backend consolidado).
// Actualizar API_BASE con la URL que devuelva el deploy y listo.
export const API_BASE = 'https://i9m3hyluue.execute-api.us-east-1.amazonaws.com'

// Alias por dominio (todos apuntan a la misma API; se mantienen por claridad)
export const API_USUARIOS = API_BASE
export const API_PRODUCTOS = API_BASE
export const API_PEDIDOS = API_BASE
export const API_SEDES = API_BASE

// Respaldo del selector si GET /sedes falla (las sedes reales vienen del backend).
export const TENANTS = [
  { id: 'pj-miraflores', nombre: 'Papa Johns - Miraflores' },
  { id: 'pj-surco', nombre: 'Papa Johns - Surco' },
  { id: 'pj-san-isidro', nombre: 'Papa Johns - San Isidro' },
  { id: 'pj-la-molina', nombre: 'Papa Johns - La Molina' },
]
