import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  ShoppingCart, User, LogOut, Plus, Minus, X, Moon, Sun, MapPin, ChevronDown,
  ClipboardList, Check, Pizza, PartyPopper, Tag, Store, Truck, Info, UtensilsCrossed,
} from 'lucide-react'
import { API_USUARIOS, API_PRODUCTOS, API_PEDIDOS, API_SEDES, TENANTS } from './config.js'

const CATEGORIAS = [
  { id: 'todas', label: 'Todo' },
  { id: 'pizzas', label: 'Pizzas' },
  { id: 'complementos', label: 'Complementos' },
  { id: 'bebidas', label: 'Bebidas' },
  { id: 'postres', label: 'Postres' },
]
const EMOJI = { pizzas: '🍕', complementos: '🧄', bebidas: '🥤', postres: '🍫' }
const soles = (n) => 'S/ ' + Number(n || 0).toFixed(2)

const SECCIONES = [
  { id: 'menu', label: 'Menú', icon: UtensilsCrossed },
  { id: 'promos', label: 'Promos exclusivas', icon: Tag },
  { id: 'locales', label: 'Locales', icon: Store },
  { id: 'rastrea', label: 'Rastrea tu pedido', icon: Truck },
  { id: 'nosotros', label: 'Nosotros', icon: Info },
]

// Combos sugeridos (bundles del catálogo). El total real lo calcula el servidor con precios de catálogo.
const PROMOS = [
  { id: 'combo-pareja', nombre: 'Combo Pareja 💑', desc: '1 Pepperoni + 1 Hawaiana + Pepsi 1.5L', emoji: '❤️',
    items: [{ product_id: 'pz-pepperoni', cant: 1 }, { product_id: 'pz-hawaiana', cant: 1 }, { product_id: 'bd-pepsi15', cant: 1 }] },
  { id: 'combo-familiar', nombre: 'Combo Familiar 👨‍👩‍👧', desc: '1 Super Papa + Palitos de Ajo + Pepsi 1.5L', emoji: '🍕',
    items: [{ product_id: 'pz-superpapa', cant: 1 }, { product_id: 'cp-breadsticks', cant: 1 }, { product_id: 'bd-pepsi15', cant: 1 }] },
  { id: 'combo-amigos', nombre: 'Combo Amigos 🎉', desc: '2 Cheese + Chicken Poppers', emoji: '🧀',
    items: [{ product_id: 'pz-cheese', cant: 2 }, { product_id: 'cp-poppers', cant: 1 }] },
  { id: 'combo-dulce', nombre: 'Antojo Dulce 🍫', desc: '1 Pepperoni + Mega Brownie', emoji: '🍫',
    items: [{ product_id: 'pz-pepperoni', cant: 1 }, { product_id: 'ps-brownie', cant: 1 }] },
]

function useToasts() {
  const [toasts, setToasts] = useState([])
  const push = useCallback((msg, icon) => {
    const id = Math.random()
    setToasts(t => [...t, { id, msg, icon }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2600)
  }, [])
  const view = <div className="toasts">{toasts.map(t => <div className="toast" key={t.id}>{t.icon}{t.msg}</div>)}</div>
  return [push, view]
}

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light')
  const [sedes, setSedes] = useState(TENANTS)
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
  const [seccion, setSeccion] = useState('menu')
  const [toast, toastView] = useToasts()

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); localStorage.setItem('theme', theme) }, [theme])

  useEffect(() => {
    fetch(`${API_SEDES}/sedes`).then(r => r.json())
      .then(d => { if (d.sedes?.length) setSedes(d.sedes) }).catch(() => {})
  }, [])

  useEffect(() => {
    setCargando(true)
    fetch(`${API_PRODUCTOS}/productos?tenant_id=${tenant}`)
      .then(r => r.json()).then(d => setProductos(d.productos || []))
      .catch(() => setProductos([])).finally(() => setCargando(false))
    setCart([])
  }, [tenant])

  const visibles = useMemo(
    () => categoria === 'todas' ? productos : productos.filter(p => p.categoria === categoria),
    [productos, categoria])
  const totalItems = cart.reduce((s, i) => s + i.cant, 0)
  const total = cart.reduce((s, i) => s + i.precio * i.cant, 0)

  const addCart = (p, n = 1) => {
    setCart(prev => {
      const ex = prev.find(i => i.product_id === p.product_id)
      return ex ? prev.map(i => i.product_id === p.product_id ? { ...i, cant: i.cant + n } : i)
                : [...prev, { ...p, cant: n }]
    })
  }
  const addProducto = (p) => { addCart(p); toast(`${p.nombre} agregado`, <Check size={16} />) }
  const addPromo = (promo) => {
    let agregados = 0
    promo.items.forEach(it => {
      const prod = productos.find(p => p.product_id === it.product_id)
      if (prod) { addCart(prod, it.cant); agregados += it.cant }
    })
    if (agregados) { toast(`${promo.nombre} agregado al carrito`, <Tag size={16} />); setShowCart(true) }
    else toast('Esa promo no está disponible en esta sede')
  }
  const setQty = (pid, d) => setCart(prev => prev.flatMap(i => {
    if (i.product_id !== pid) return [i]
    const c = i.cant + d
    return c <= 0 ? [] : [{ ...i, cant: c }]
  }))

  const logout = () => { localStorage.removeItem('sesion'); setSesion(null); toast('Sesión cerrada') }

  const ordenar = async () => {
    if (!sesion) { setShowCart(false); setShowLogin(true); return }
    setOrdenando(true)
    try {
      const r = await fetch(`${API_PEDIDOS}/pedidos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sesion.token}` },
        body: JSON.stringify({ items: cart.map(i => ({ product_id: i.product_id, nombre: i.nombre, precio: i.precio, cant: i.cant })) }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Error al crear el pedido')
      setCart([]); setShowCart(false); setTracking(d.order_id); toast('¡Pedido enviado!', <Pizza size={16} />)
    } catch (e) { toast(e.message) } finally { setOrdenando(false) }
  }

  const sedeActual = sedes.find(s => s.id === tenant)

  return (
    <div>
      <header className="header">
        <div className="logo"><Pizza size={24} />Papa Johns<span className="dot">.</span></div>
        <SedePicker sedes={sedes} value={tenant} onChange={setTenant} />
        <div className="spacer" />
        <button className="icon-btn" onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} title="Tema">
          {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
        </button>
        <button className="icon-btn cart-btn" onClick={() => setShowCart(true)} title="Carrito">
          <ShoppingCart size={20} />
          {totalItems > 0 && <span className="cart-badge" key={totalItems}>{totalItems}</span>}
        </button>
        {sesion ? (
          <div className="user-chip">
            <User size={18} /> <b>{sesion.nombre.split(' ')[0]}</b>
            <button className="icon-btn" onClick={logout} title="Salir"><LogOut size={18} /></button>
          </div>
        ) : (
          <button className="btn btn-red" onClick={() => setShowLogin(true)}><User size={16} />Ingresar</button>
        )}
      </header>

      <nav className="topnav">
        {SECCIONES.map(s => (
          <button key={s.id} className={`navlink ${seccion === s.id ? 'active' : ''}`} onClick={() => setSeccion(s.id)}>
            <s.icon size={16} />{s.label}
          </button>
        ))}
      </nav>

      {seccion === 'menu' && (
        <>
          <section className="hero">
            <h1>Mejores ingredientes.<br />Mejor pizza.</h1>
            <p>Pide online y sigue tu pedido en tiempo real, paso a paso.</p>
            <div className="pizza">🍕</div>
          </section>
          <div className="tabs">
            {CATEGORIAS.map(c => (
              <button key={c.id} className={`tab ${categoria === c.id ? 'active' : ''}`} onClick={() => setCategoria(c.id)}>{c.label}</button>
            ))}
          </div>
          {cargando ? (
            <div className="grid">
              {Array.from({ length: 8 }).map((_, i) => (
                <div className="sk" key={i}><div className="sk-img shimmer" /><div className="sk-line shimmer" /><div className="sk-line short shimmer" /></div>
              ))}
            </div>
          ) : (
            <div className="grid">
              {visibles.map(p => (
                <div className="card" key={p.product_id}>
                  <div className="card-img">
                    <img src={p.image_url} alt={p.nombre}
                         onError={e => { e.target.style.display = 'none'; e.target.parentNode.append(EMOJI[p.categoria] || '🍕') }} />
                  </div>
                  <div className="card-body">
                    <span className="card-cat">{p.categoria}</span>
                    <h3>{p.nombre}</h3>
                    <p>{p.descripcion}</p>
                    <div className="card-footer">
                      <span className="precio">{soles(p.precio)}</span>
                      <button className="btn btn-green" onClick={() => addProducto(p)}><Plus size={16} />Agregar</button>
                    </div>
                  </div>
                </div>
              ))}
              {visibles.length === 0 && <div className="empty">No hay productos en esta categoría.</div>}
            </div>
          )}
        </>
      )}

      {seccion === 'promos' && (
        <div className="seccion">
          <h2 className="sec-title"><Tag size={22} /> Promos exclusivas</h2>
          <p className="sec-sub">Combos armados para ti. Se agregan al carrito y pagas el precio del catálogo.</p>
          <div className="grid">
            {PROMOS.map(pr => (
              <div className="card promo" key={pr.id}>
                <div className="card-img promo-img">{pr.emoji}<span className="promo-badge">OFERTA</span></div>
                <div className="card-body">
                  <h3>{pr.nombre}</h3>
                  <p>{pr.desc}</p>
                  <button className="btn btn-red" style={{ justifyContent: 'center', marginTop: 8 }} onClick={() => addPromo(pr)}>
                    <Plus size={16} />Agregar combo
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {seccion === 'locales' && (
        <div className="seccion">
          <h2 className="sec-title"><Store size={22} /> Nuestros locales</h2>
          <p className="sec-sub">Elige tu local más cercano. Estás pidiendo en: <b>{sedeActual?.nombre || tenant}</b>.</p>
          <div className="grid">
            {sedes.map(s => (
              <div className={`card local ${s.id === tenant ? 'sel' : ''}`} key={s.id}>
                <div className="card-body">
                  <h3><MapPin size={18} /> {s.nombre}</h3>
                  <p>{s.direccion || 'Dirección no disponible'}</p>
                  <button className={`btn ${s.id === tenant ? 'btn-ghost' : 'btn-green'}`} style={{ justifyContent: 'center', marginTop: 8 }}
                          onClick={() => { setTenant(s.id); setSeccion('menu'); toast(`Pedirás en ${s.nombre}`) }}>
                    {s.id === tenant ? 'Local seleccionado' : 'Pedir en este local'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {seccion === 'rastrea' && <Rastrea sesion={sesion} onLogin={() => setShowLogin(true)} onTrack={setTracking} />}

      {seccion === 'nosotros' && (
        <div className="seccion nosotros">
          <h2 className="sec-title"><Info size={22} /> Nosotros</h2>
          <p>En <b>Papa Johns</b> creemos que con mejores ingredientes se hace mejor pizza. Masa fresca, salsa de tomates
             madurados y los mejores complementos, recién horneados para ti.</p>
          <p>Hoy operamos en <b>{sedes.length} locales</b> y puedes pedir desde nuestra web o desde tus apps favoritas,
             siguiendo tu pedido en tiempo real, desde que entra a cocina hasta que llega a tu puerta.</p>
          <div className="vals">
            <div className="val"><Pizza size={26} /><b>Calidad</b><span>Ingredientes frescos cada día</span></div>
            <div className="val"><Truck size={26} /><b>Rapidez</b><span>Seguimiento en vivo de tu pedido</span></div>
            <div className="val"><Store size={26} /><b>Cerca de ti</b><span>{sedes.length} locales y creciendo</span></div>
          </div>
        </div>
      )}

      {showCart && (
        <>
          <div className="overlay" onClick={() => setShowCart(false)} />
          <aside className="drawer">
            <h2><ShoppingCart size={22} />Tu pedido</h2>
            <div className="drawer-items">
              {cart.length === 0 && <div className="empty">Tu carrito está vacío 🛒</div>}
              {cart.map(i => (
                <div className="line" key={i.product_id}>
                  <span className="ln-name">{i.nombre}</span>
                  <div className="qty">
                    <button onClick={() => setQty(i.product_id, -1)}><Minus size={14} /></button>
                    <b>{i.cant}</b>
                    <button onClick={() => setQty(i.product_id, +1)}><Plus size={14} /></button>
                  </div>
                  <span className="ln-price">{soles(i.precio * i.cant)}</span>
                </div>
              ))}
            </div>
            <div className="drawer-total"><span>Total</span><span>{soles(total)}</span></div>
            <button className="btn btn-red" style={{ justifyContent: 'center' }} disabled={cart.length === 0 || ordenando} onClick={ordenar}>
              {ordenando ? 'Enviando…' : 'Ordenar ahora'}
            </button>
            <button className="btn btn-ghost" style={{ justifyContent: 'center', marginTop: 8 }} onClick={() => setShowCart(false)}>Seguir comprando</button>
          </aside>
        </>
      )}

      {tracking && <Tracker sesion={sesion} orderId={tracking} onClose={() => setTracking(null)} />}
      {showLogin && <LoginModal tenant={tenant} onClose={() => setShowLogin(false)} toast={toast}
        onLogin={s => { localStorage.setItem('sesion', JSON.stringify(s)); setSesion(s); setShowLogin(false); toast(`Hola, ${s.nombre.split(' ')[0]}`) }} />}
      {toastView}
    </div>
  )
}

function SedePicker({ sedes, value, onChange }) {
  const [open, setOpen] = useState(false)
  const actual = sedes.find(s => s.id === value)
  return (
    <div className="picker">
      <button className="picker-btn" onClick={() => setOpen(o => !o)}>
        <MapPin size={16} /><span>{actual?.nombre || 'Elegir sede'}</span><ChevronDown size={15} />
      </button>
      {open && <>
        <div className="picker-back" onClick={() => setOpen(false)} />
        <div className="picker-menu">
          {sedes.map(s => (
            <button key={s.id} className={`picker-item ${s.id === value ? 'active' : ''}`}
                    onClick={() => { onChange(s.id); setOpen(false) }}><MapPin size={14} /> {s.nombre}</button>
          ))}
        </div>
      </>}
    </div>
  )
}

const FLOW = ['RECEIVED', 'COOKING', 'PACKING', 'DELIVERING', 'DELIVERED']
const FLOW_LABEL = { RECEIVED: 'Recibido', COOKING: 'En cocina', PACKING: 'Empacando', DELIVERING: 'En camino', DELIVERED: 'Entregado', FAILED: 'Fallido' }

function Rastrea({ sesion, onLogin, onTrack }) {
  const [pedidos, setPedidos] = useState(null)
  const cargar = () => {
    if (!sesion) return
    fetch(`${API_PEDIDOS}/pedidos`, { headers: { Authorization: `Bearer ${sesion.token}` } })
      .then(r => r.json()).then(d => setPedidos((d.pedidos || []).reverse())).catch(() => setPedidos([]))
  }
  useEffect(() => { cargar() }, [])
  if (!sesion) return (
    <div className="seccion"><h2 className="sec-title"><Truck size={22} /> Rastrea tu pedido</h2>
      <div className="empty">Inicia sesión para ver y seguir tus pedidos.
        <div style={{ marginTop: 14 }}><button className="btn btn-red" onClick={onLogin}>Ingresar</button></div>
      </div>
    </div>
  )
  return (
    <div className="seccion">
      <h2 className="sec-title"><Truck size={22} /> Rastrea tu pedido</h2>
      {pedidos === null && <div className="empty">Cargando…</div>}
      {pedidos?.length === 0 && <div className="empty">Aún no tienes pedidos. ¡Haz tu primer pedido en el Menú!</div>}
      {pedidos?.map(p => (
        <div className="pedido-row" key={p.order_id}>
          <div><b>#{p.order_id}</b> · {soles(p.total)}<div className="pedido-fecha">{new Date(p.created_at).toLocaleString('es-PE')}</div></div>
          <span className={`chip ${p.status}`}>{FLOW_LABEL[p.status] || p.status}</span>
          <button className="btn btn-green" style={{ padding: '7px 14px' }} onClick={() => onTrack(p.order_id)}>Seguir</button>
        </div>
      ))}
    </div>
  )
}

function Tracker({ sesion, orderId, onClose }) {
  const [status, setStatus] = useState('RECEIVED')
  useEffect(() => {
    const load = () => fetch(`${API_PEDIDOS}/pedidos/${orderId}`, { headers: { Authorization: `Bearer ${sesion.token}` } })
      .then(r => r.json()).then(d => setStatus(d.status || 'RECEIVED')).catch(() => {})
    load(); const t = setInterval(load, 5000); return () => clearInterval(t)
  }, [orderId])
  const idx = FLOW.indexOf(status)
  const entregado = status === 'DELIVERED'
  return (
    <div className="modal-center"><div className="overlay" onClick={onClose} />
      <div className="modal">
        <button className="icon-btn close" onClick={onClose}><X size={18} /></button>
        <h2>Pedido #{orderId}</h2>
        <div className="track">
          {FLOW.map((s, i) => {
            const done = i < idx || entregado
            const current = i === idx && !entregado
            return (
              <div key={s} className={`track-step ${done ? 'done' : current ? 'current' : ''}`}>
                <span className={`rail ${done ? 'filled' : ''}`} />
                <span className="dot">{done ? <Check size={16} /> : current ? '●' : i + 1}</span>
                <span className="lbl">{FLOW_LABEL[s]}</span>
              </div>
            )
          })}
        </div>
        <p className="track-done-msg">
          {status === 'DELIVERED' ? <><PartyPopper size={18} style={{ verticalAlign: 'middle' }} /> ¡Buen provecho!</>
            : status === 'FAILED' ? '⚠️ Hubo un problema con tu pedido.'
            : 'Actualizando en tiempo real…'}
        </p>
        <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={onClose}>Cerrar</button>
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
    } catch (e) { setError(e.message) } finally { setEnviando(false) }
  }

  return (
    <div className="modal-center"><div className="overlay" onClick={onClose} />
      <div className="modal">
        <button className="icon-btn close" onClick={onClose}><X size={18} /></button>
        <h2>{modo === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</h2>
        {modo === 'registro' && <input className="field" placeholder="Nombre" value={form.nombre} onChange={set('nombre')} />}
        <input className="field" placeholder="Email" type="email" value={form.email} onChange={set('email')} />
        <input className="field" placeholder="Contraseña" type="password" value={form.password} onChange={set('password')}
               onKeyDown={e => e.key === 'Enter' && submit()} />
        {error && <div className="error">{error}</div>}
        <button className="btn btn-red" style={{ width: '100%', justifyContent: 'center' }} disabled={enviando} onClick={submit}>
          {enviando ? 'Enviando…' : modo === 'login' ? 'Entrar' : 'Registrarme'}
        </button>
        <div className="link" onClick={() => setModo(m => m === 'login' ? 'registro' : 'login')}>
          {modo === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
        </div>
      </div>
    </div>
  )
}
