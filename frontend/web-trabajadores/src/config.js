// Toda la app usa UNA sola API Gateway (backend consolidado).
// Actualizar API_BASE con la URL que devuelva el deploy.
export const API_BASE = 'https://i9m3hyluue.execute-api.us-east-1.amazonaws.com'

export const API_USUARIOS = API_BASE
export const API_PEDIDOS = API_BASE
export const API_WORKFLOW = API_BASE

export const TENANTS = [
  { id: 'pj-miraflores', nombre: 'Papa Johns - Miraflores' },
  { id: 'pj-surco', nombre: 'Papa Johns - Surco' },
  { id: 'pj-san-isidro', nombre: 'Papa Johns - San Isidro' },
  { id: 'pj-la-molina', nombre: 'Papa Johns - La Molina' },
]

export const PASOS_POR_ROL = {
  COCINERO: ['COCINAR'],
  DESPACHADOR: ['EMPACAR'],
  REPARTIDOR: ['REPARTIR', 'ENTREGAR'],
  ADMIN: ['COCINAR', 'EMPACAR', 'REPARTIR', 'ENTREGAR'],
}

export const PASO_LABEL = { COCINAR: '👨‍🍳 Cocinar', EMPACAR: '📦 Empacar', REPARTIR: '🛵 Repartir', ENTREGAR: '✅ Entregar' }
export const STATUS_LABEL = { RECEIVED: 'Recibido', COOKING: 'En cocina', PACKING: 'Empacando', DELIVERING: 'En camino', DELIVERED: 'Entregado', FAILED: 'Fallido' }
