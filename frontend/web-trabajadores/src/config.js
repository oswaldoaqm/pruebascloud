// Toda la app usa UNA sola API Gateway (backend consolidado).
// Actualizar API_BASE con la URL que devuelva el deploy.
export const API_BASE = 'https://i9m3hyluue.execute-api.us-east-1.amazonaws.com'

export const API_USUARIOS = API_BASE
export const API_PEDIDOS = API_BASE
export const API_WORKFLOW = API_BASE
export const API_PRODUCTOS = API_BASE
export const API_SEDES = API_BASE

// Sede central (cadena): aquí entra el SUPERADMIN.
export const CENTRAL = { id: 'pj-central', nombre: '🏢 Central (cadena)' }

// Respaldo del selector si GET /sedes falla (las sedes reales se cargan del backend).
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

export const ROLES = ['COCINERO', 'DESPACHADOR', 'REPARTIDOR', 'ADMIN', 'CLIENTE']

// Catálogo de roles del sistema (referencia para el admin).
export const ROL_DESC = [
  { rol: 'COCINERO', atiende: 'Cocinar', desc: 'Prepara y cocina los pedidos.' },
  { rol: 'DESPACHADOR', atiende: 'Empacar', desc: 'Empaca la comida lista para reparto.' },
  { rol: 'REPARTIDOR', atiende: 'Repartir, Entregar', desc: 'Lleva el pedido y lo entrega al cliente.' },
  { rol: 'ADMIN', atiende: '— (gestión)', desc: 'Administra personal y productos de su sede.' },
  { rol: 'SUPERADMIN', atiende: '— (cadena)', desc: 'Gestiona sedes y ve métricas de toda la cadena.' },
  { rol: 'CLIENTE', atiende: '— (web clientes)', desc: 'Realiza pedidos desde la web de clientes.' },
]
export const TITULOS_SUGERIDOS = [
  'Jefe de cocina', 'Empleado del mes', 'Repartidor estrella',
  'Maestro pizzero', 'Despachador veloz', 'Novato',
]

export const PASO_LABEL = { COCINAR: '👨‍🍳 Cocinar', EMPACAR: '📦 Empacar', REPARTIR: '🛵 Repartir', ENTREGAR: '✅ Entregar' }
export const STATUS_LABEL = { RECEIVED: 'Recibido', COOKING: 'En cocina', PACKING: 'Empacando', DELIVERING: 'En camino', DELIVERED: 'Entregado', FAILED: 'Fallido' }
