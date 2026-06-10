export const API_USUARIOS = 'https://urvrhgysm5.execute-api.us-east-1.amazonaws.com'
export const API_PEDIDOS = 'https://os2ehl7kg2.execute-api.us-east-1.amazonaws.com'
export const API_WORKFLOW = 'https://s1fn3k0udc.execute-api.us-east-1.amazonaws.com'

export const TENANTS = [
  { id: 'pj-miraflores', nombre: 'Papa Johns - Miraflores' },
  { id: 'pj-surco', nombre: 'Papa Johns - Surco' },
]

export const PASOS_POR_ROL = {
  COCINERO: ['COCINAR'],
  DESPACHADOR: ['EMPACAR'],
  REPARTIDOR: ['REPARTIR', 'ENTREGAR'],
  ADMIN: ['COCINAR', 'EMPACAR', 'REPARTIR', 'ENTREGAR'],
}

export const PASO_LABEL = { COCINAR: '👨‍🍳 Cocinar', EMPACAR: '📦 Empacar', REPARTIR: '🛵 Repartir', ENTREGAR: '✅ Entregar' }
export const STATUS_LABEL = { RECEIVED: 'Recibido', COOKING: 'En cocina', PACKING: 'Empacando', DELIVERING: 'En camino', DELIVERED: 'Entregado', FAILED: 'Fallido' }
