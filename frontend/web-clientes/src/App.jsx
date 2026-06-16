import { useEffect, useMemo, useState } from 'react'
import { API_USUARIOS, API_PRODUCTOS, API_PEDIDOS, API_SEDES, TENANTS } from './config.js'

const CATEGORIAS = [
  { id: 'todas', label: 'Todo' },
  { id: 'pizzas', label: 'Pizzas' },
  { id: 'complementos', label: 'Complementos' },
  { id: 'bebidas', label: 'Bebidas' },
  { id: 'postres', label: 'Postres' },
]
const EMOJI = { pizzas: '🍕', complementos: '🧄', bebidas: '🥤', postres: '🍫' }

export default function App() {
  const [sedes, setSedes] = useState(TENANTS)            // respaldo; se reemplaza con backend
  const [tenant, setTenant] = useState(TENANTS[0].id)
  const [productos, setProductos] = useState([])
  const [categoria, setCategoria] = useState('todas')
  const [cargando, setCargando] = useState(true)
  const [sesion, setSesion] = useState(() => JSON.parse(localStorage.getItem('sesion') || 'null'))
  const [showLogin, setShowLogin] = useState(false)
  const [showCart, setShowCart] = useState(false)
  const [cart, setCart] = useState([])
  const [tracking, setTracking] = useState(null)
  const [ordenando, setOrdenando] = useState(false)
  const [showPedidos, setShowPedidos] = useState(false)

  const ordenar = async () => {
    if (!sesion) { setShowCart(false); setShowLogin(true); return }
    setOrdenando(true)
    try {
      const r = await fetch(`${API_PEDIDOS}/pedidos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sesion.token}` },
        body: JSON.stringify({ items: cart.map(i => ({ product_id: i.product_id, nombre: i.nombre, precio: i.precio, cant: i.cant })) }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Error al crear el pedido')
      setCart([]); setShowCart(false); setTracking(d.order_id)
    } catch (e) {
      alert(e.message)
    } finally {
      setOrdenando(false)
    }
  }

  useEffect(() => {
    fetch(`${API_SEDES}/sedes`).then(r => r.json())
      .then(d => { if (d.sedes?.length) setSedes(d.sedes.map(s => ({ id: s.id, nombre: s.nombre }))) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    setCargando(true)
    fetch(`${API_PRODUCTOS}/productos?tenant_id=${tenant}`)
      .then(r => r.json())
      .then(d => setProductos(d.productos || []))
      .catch(() => setProductos([]))
      .finally(() => setCargando(false))
    setCart([]) // el carrito no cruza tenants
  }, [tenant])

  const visibles = useMemo(
    () => categoria === 'todas' ? productos : productos.filter(p => p.categoria === categoria),
    [productos, categoria]
  )
  const total = cart.reduce((s, i) => s + i.precio * i.cant, 0)

  const addCart = (p) => {
    setCart(prev => {
      const ex = prev.find(i => i.product_id === p.product_id)
      return ex
        ? prev.map(i => i.product_id === p.product_id ? { ...i, cant: i.cant + 1 } : i)
        : [...prev, { ...p, cant: 1 }]
    })
  }

  const logout = () => { localStorage.removeItem('sesion'); setSesion(null) }

  return (
    <div>
      <header className="header">
        <div className="logo">Papa Johns<span> Pizza</span></div>
        <select value={tenant} onChange={e => setTenant(e.target.value)}>
          {sedes.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
        <div className="header-actions">
          <button className="btn btn-white" onClick={() => setShowCart(true)}>
            🛒 Carrito {cart.length > 0 && <span className="badge">{cart.reduce((s, i) => s + i.cant, 0)}</span>}
          </button>
          {sesion
            ? <>
                <span>Hola, <b>{sesion.nombre}</b></span>
                <button className="btn btn-white" onClick={() => setShowPedidos(true)}>Mis pedidos</button>
                <button className="btn btn-red" onClick={logout}>Salir</button>
              </>
            : <button className="btn btn-red" onClick={() => setShowLogin(true)}>Iniciar sesión</button>}
        </div>
      </header>

      <section className="hero">
        <h1>Mejores ingredientes. Mejor pizza.</h1>
        <p>Pide online y sigue tu pedido en tiempo real</p>
      </section>

      <div className="tabs">
        {CATEGORIAS.map(c => (
          <button key={c.id} className={`tab ${categoria === c.id ? 'active' : ''}`}
                  onClick={() => setCategoria(c.id)}>{c.label}</button>
        ))}
      </div>

      {cargando
        ? <div className="empty">Cargando catálogo…</div>
        : <div className="grid">
            {visibles.map(p => (
              <div className="card" key={p.product_id}>
                <div className="card-img">
                  <img src={p.image_url} alt={p.nombre}
                       onError={e => { e.target.style.display = 'none'; e.target.parentNode.append(EMOJI[p.categoria] || '🍕') }} />
                </div>
                <div className="card-body">
                  <h3>{p.nombre}</h3>
                  <p>{p.descripcion}</p>
                  <div className="card-footer">
                    <span className="precio">S/ {Number(p.precio).toFixed(2)}</span>
                    <button className="btn btn-green" onClick={() => addCart(p)}>Agregar</button>
                  </div>
                </div>
              </div>
            ))}
          </div>}

      {tracking && <Tracker sesion={sesion} orderId={tracking} onClose={() => setTracking(null)} />}

      {showPedidos && sesion && (
        <MisPedidos sesion={sesion} onClose={() => setShowPedidos(false)}
                    onTrack={oid => { setShowPedidos(false); setTracking(oid) }} />
      )}

      {showLogin && <LoginModal tenant={tenant} onClose={() => setShowLogin(false)}
        onLogin={s => { localStorage.setItem('sesion', JSON.stringify(s)); setSesion(s); setShowLogin(false) }} />}

      {showCart && (
        <div className="cart-drawer">
          <h2>Tu pedido</h2>
          <div className="cart-items">
            {cart.length === 0 && <div className="empty">Carrito vacío</div>}
            {cart.map(i => (
              <div className="cart-item" key={i.product_id}>
                <span>{i.cant}x {i.nombre}</span>
                <span>S/ {(i.precio * i.cant).toFixed(2)}</span>
                <button onClick={() => setCart(c => c.filter(x => x.product_id !== i.product_id))}>×</button>
              </div>
            ))}
          </div>
          <div className="cart-total"><span>Total</span><span>S/ {total.toFixed(2)}</span></div>
          <button className="btn btn-red" disabled={cart.length === 0 || ordenando} onClick={ordenar}>
            {ordenando ? 'Enviando…' : 'Ordenar ahora'}
          </button>
          <button className="btn btn-white" style={{ marginTop: 8 }} onClick={() => setShowCart(false)}>Cerrar</button>
        </div>
      )}
    </div>
  )
}

function MisPedidos({ sesion, onClose, onTrack }) {
  const [pedidos, setPedidos] = useState(null)
  useEffect(() => {
    fetch(`${API_PEDIDOS}/pedidos`, { headers: { Authorization: `Bearer ${sesion.token}` } })
      .then(r => r.json()).then(d => setPedidos((d.pedidos || []).reverse())).catch(() => setPedidos([]))
  }, [])
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Mis pedidos</h2>
        {pedidos === null && <p>Cargando…</p>}
        {pedidos?.length === 0 && <p>Aún no tienes pedidos.</p>}
        {pedidos?.map(p => (
          <div className="pedido-row" key={p.order_id}>
            <div>
              <b>#{p.order_id}</b> · S/ {Number(p.total).toFixed(2)}
              <div className="pedido-fecha">{new Date(p.created_at).toLocaleString('es-PE')}</div>
            </div>
            <span className={`chip ${p.status}`}>{FLOW_LABEL[p.status] || p.status}</span>
            <button className="btn btn-green" onClick={() => onTrack(p.order_id)}>Ver</button>
          </div>
        ))}
        <button className="btn btn-white" style={{ width: '100%', marginTop: 12 }} onClick={onClose}>Cerrar</button>
      </div>
    </div>
  )
}

const FLOW = ['RECEIVED', 'COOKING', 'PACKING', 'DELIVERING', 'DELIVERED']
const FLOW_LABEL = { RECEIVED: 'Recibido', COOKING: 'En cocina', PACKING: 'Empacando', DELIVERING: 'En camino', DELIVERED: 'Entregado', FAILED: 'Fallido' }

function Tracker({ sesion, orderId, onClose }) {
  const [status, setStatus] = useState('RECEIVED')
  useEffect(() => {
    const load = () =>
      fetch(`${API_PEDIDOS}/pedidos/${orderId}`, { headers: { Authorization: `Bearer ${sesion.token}` } })
        .then(r => r.json()).then(d => setStatus(d.status || 'RECEIVED')).catch(() => {})
    load()
    const t = setInterval(load, 5000) // polling: estado casi en tiempo real
    return () => clearInterval(t)
  }, [orderId])
  const idx = FLOW.indexOf(status)
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Pedido #{orderId}</h2>
        <div className="track">
          {FLOW.map((s, i) => (
            <div key={s} className={`track-step ${i <= idx ? 'done' : ''}`}>
              <div className="dot">{i < idx ? '✓' : i === idx ? '●' : ''}</div>
              <span>{FLOW_LABEL[s]}</span>
            </div>
          ))}
        </div>
        <p style={{ textAlign: 'center', color: status === 'FAILED' ? '#ce1126' : '#888', marginTop: 8 }}>
          {status === 'DELIVERED' ? '🍕 ¡Buen provecho!'
            : status === 'FAILED' ? '⚠️ Hubo un problema con tu pedido. Contáctanos.'
            : 'Actualizando cada 5 segundos…'}
        </p>
        <button className="btn btn-green" style={{ width: '100%', marginTop: 12 }} onClick={onClose}>Cerrar</button>
      </div>
    </div>
  )
}

function LoginModal({ tenant, onClose, onLogin }) {
  const [modo, setModo] = useState('login')
  const [form, setForm] = useState({ email: '', password: '', nombre: '' })
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = async () => {
    setError(''); setEnviando(true)
    try {
      if (modo === 'registro') {
        const r = await fetch(`${API_USUARIOS}/auth/register`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenant_id: tenant, ...form, role: 'CLIENTE' }),
        })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Error al registrar')
      }
      const r = await fetch(`${API_USUARIOS}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenant, email: form.email, password: form.password }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Credenciales inválidas')
      onLogin({ token: d.token, nombre: d.nombre, role: d.role, tenant_id: d.tenant_id })
    } catch (e) {
      setError(e.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{modo === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</h2>
        {modo === 'registro' && <input placeholder="Nombre" value={form.nombre} onChange={set('nombre')} />}
        <input placeholder="Email" type="email" value={form.email} onChange={set('email')} />
        <input placeholder="Contraseña" type="password" value={form.password} onChange={set('password')} />
        {error && <div className="error">{error}</div>}
        <button className="btn btn-red" style={{ width: '100%' }} disabled={enviando} onClick={submit}>
          {enviando ? 'Enviando…' : modo === 'login' ? 'Entrar' : 'Registrarme'}
        </button>
        <div className="link" onClick={() => setModo(m => m === 'login' ? 'registro' : 'login')}>
          {modo === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
        </div>
      </div>
    </div>
  )
}
