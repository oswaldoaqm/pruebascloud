import { useEffect, useState } from 'react'
import {
  API_USUARIOS, API_PEDIDOS, API_WORKFLOW, API_PRODUCTOS, API_SEDES,
  TENANTS, CENTRAL, PASOS_POR_ROL, PASO_LABEL, STATUS_LABEL, ROLES, ROL_DESC, TITULOS_SUGERIDOS,
} from './config.js'

const fmt = (iso) => iso ? new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'
const soles = (n) => 'S/ ' + Number(n || 0).toFixed(2)

export default function App() {
  const [sesion, setSesion] = useState(() => JSON.parse(localStorage.getItem('sesion_trab') || 'null'))
  const [vista, setVista] = useState('tareas')

  if (!sesion) return <Login onLogin={s => { localStorage.setItem('sesion_trab', JSON.stringify(s)); setSesion(s) }} />

  const logout = () => { localStorage.removeItem('sesion_trab'); setSesion(null) }
  const esAdmin = sesion.role === 'ADMIN'
  const esSuper = sesion.role === 'SUPERADMIN'

  return (
    <div>
      <header className="header">
        <div className="logo">Papa Johns<small>{esSuper ? 'Consola de cadena' : 'Panel de trabajadores'} · {sesion.tenant_id}</small></div>
        <div>
          <span style={{ marginRight: 12 }}>
            {sesion.nombre} ({sesion.role}){sesion.titulo ? <span className="titulo-badge">🏅 {sesion.titulo}</span> : null}
          </span>
          <button className="btn btn-red" onClick={logout}>Salir</button>
        </div>
      </header>

      {esSuper ? (
        <main className="main"><SuperAdmin sesion={sesion} /></main>
      ) : (
        <>
          <nav className="nav">
            <button className={vista === 'tareas' ? 'active' : ''} onClick={() => setVista('tareas')}>Mis tareas</button>
            <button className={vista === 'pedidos' ? 'active' : ''} onClick={() => setVista('pedidos')}>Pedidos</button>
            <button className={vista === 'dashboard' ? 'active' : ''} onClick={() => setVista('dashboard')}>Dashboard</button>
            {esAdmin && <>
              <button className={vista === 'admin' ? 'active' : ''} onClick={() => setVista('admin')}>⚙️ Personal</button>
              <button className={vista === 'productos' ? 'active' : ''} onClick={() => setVista('productos')}>🍕 Productos</button>
              <button className={vista === 'roles' ? 'active' : ''} onClick={() => setVista('roles')}>🎭 Roles</button>
            </>}
          </nav>
          <main className="main">
            {vista === 'tareas' && <Tareas sesion={sesion} />}
            {vista === 'pedidos' && <Pedidos sesion={sesion} />}
            {vista === 'dashboard' && <Dashboard sesion={sesion} />}
            {vista === 'admin' && esAdmin && <Admin sesion={sesion} />}
            {vista === 'productos' && esAdmin && <ProductosAdmin sesion={sesion} />}
            {vista === 'roles' && esAdmin && <RolesRef />}
          </main>
        </>
      )}
    </div>
  )
}

function Login({ onLogin }) {
  const [sedes, setSedes] = useState(TENANTS)              // respaldo; se reemplaza con backend
  const [form, setForm] = useState({ tenant_id: TENANTS[0].id, email: '', password: '' })
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`${API_SEDES}/sedes`).then(r => r.json())
      .then(d => { if (d.sedes?.length) setSedes(d.sedes.map(s => ({ id: s.id, nombre: s.nombre }))) })
      .catch(() => {})
  }, [])

  const opciones = [...sedes, CENTRAL]   // Central para el SUPERADMIN

  const submit = async () => {
    setError('')
    try {
      const r = await fetch(`${API_USUARIOS}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Credenciales inválidas')
      if (d.role === 'CLIENTE') throw new Error('Esta web es solo para trabajadores')
      onLogin({ token: d.token, nombre: d.nombre, role: d.role, tenant_id: d.tenant_id, titulo: d.titulo || '' })
    } catch (e) { setError(e.message) }
  }
  return (
    <div className="login-page">
      <div className="login-box">
        <h1>Papa Johns</h1>
        <p>Panel de trabajadores</p>
        <select value={form.tenant_id} onChange={e => setForm(f => ({ ...f, tenant_id: e.target.value }))}>
          {opciones.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
        <input placeholder="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        <input placeholder="Contraseña" type="password" value={form.password}
               onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
               onKeyDown={e => e.key === 'Enter' && submit()} />
        {error && <div className="error">{error}</div>}
        <button className="btn btn-green" style={{ width: '100%' }} onClick={submit}>Entrar</button>
      </div>
    </div>
  )
}

function Tareas({ sesion }) {
  const pasos = PASOS_POR_ROL[sesion.role] || []
  const [paso, setPaso] = useState(pasos[0])
  const [pendientes, setPendientes] = useState([])
  const [enCurso, setEnCurso] = useState([])

  const auth = { Authorization: `Bearer ${sesion.token}` }
  const cargar = () => {
    if (!paso) return
    fetch(`${API_WORKFLOW}/tareas?paso=${paso}&status=PENDING`, { headers: auth })
      .then(r => r.json()).then(d => setPendientes(d.tareas || [])).catch(() => {})
    fetch(`${API_WORKFLOW}/tareas?paso=${paso}&status=IN_PROGRESS`, { headers: auth })
      .then(r => r.json()).then(d => setEnCurso(d.tareas || [])).catch(() => {})
  }
  useEffect(() => { cargar(); const t = setInterval(cargar, 5000); return () => clearInterval(t) }, [paso])

  const accion = async (orderId, tipo) => {
    const r = await fetch(`${API_WORKFLOW}/tareas/${orderId}/${paso}/${tipo}`, { method: 'POST', headers: auth })
    const d = await r.json()
    if (!r.ok) alert(d.error || 'Error')
    cargar()
  }

  return (
    <div>
      <div className="paso-tabs">
        {pasos.map(p => <button key={p} className={p === paso ? 'active' : ''} onClick={() => setPaso(p)}>{PASO_LABEL[p]}</button>)}
      </div>
      <div className="cols">
        <div className="col">
          <h3>⏳ Pendientes (orden de llegada)</h3>
          {pendientes.length === 0 && <div className="empty">Sin tareas pendientes</div>}
          {pendientes.map(t => (
            <div className="tarea" key={t.order_id}>
              <div>
                <b>#{t.order_id}</b> <span className={`chip ${t.origin}`}>{t.origin}</span>
                <div className="info">Llegó: {fmt(t.started_at)}</div>
              </div>
              <button className="btn btn-green" onClick={() => accion(t.order_id, 'tomar')}>Tomar</button>
            </div>
          ))}
        </div>
        <div className="col">
          <h3>🔧 En curso</h3>
          {enCurso.length === 0 && <div className="empty">Nada en curso</div>}
          {enCurso.map(t => (
            <div className="tarea" key={t.order_id}>
              <div>
                <b>#{t.order_id}</b> <span className={`chip ${t.origin}`}>{t.origin}</span>
                <div className="info">Tomada: {fmt(t.taken_at)} por {t.worker_name}</div>
              </div>
              <button className="btn btn-red" onClick={() => accion(t.order_id, 'completar')}>Completar</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Pedidos({ sesion }) {
  const [pedidos, setPedidos] = useState([])
  const [timeline, setTimeline] = useState(null)
  const auth = { Authorization: `Bearer ${sesion.token}` }

  const cargar = () => fetch(`${API_PEDIDOS}/pedidos`, { headers: auth })
    .then(r => r.json()).then(d => setPedidos((d.pedidos || []).reverse())).catch(() => {})
  useEffect(() => { cargar(); const t = setInterval(cargar, 7000); return () => clearInterval(t) }, [])

  const verTimeline = async (oid) => {
    const r = await fetch(`${API_WORKFLOW}/tareas/${oid}`, { headers: auth })
    const d = await r.json()
    setTimeline({ order_id: oid, pasos: d.pasos || [] })
  }

  return (
    <div>
      <table>
        <thead><tr><th>Pedido</th><th>Origen</th><th>Cliente</th><th>Total</th><th>Estado</th><th>Creado</th><th></th></tr></thead>
        <tbody>
          {pedidos.map(p => (
            <tr key={p.order_id}>
              <td><b>#{p.order_id}</b></td>
              <td><span className={`chip ${p.origin}`}>{p.origin}</span></td>
              <td>{p.cliente?.nombre}</td>
              <td>S/ {Number(p.total).toFixed(2)}</td>
              <td><span className={`chip ${p.status}`}>{STATUS_LABEL[p.status] || p.status}</span></td>
              <td>{fmt(p.created_at)}</td>
              <td><button className="btn btn-white" onClick={() => verTimeline(p.order_id)}>Timeline</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {pedidos.length === 0 && <div className="empty">Sin pedidos aún</div>}

      {timeline && (
        <div className="modal-overlay" onClick={() => setTimeline(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Timeline pedido #{timeline.order_id}</h2>
            {timeline.pasos.length === 0 && <div className="empty">El workflow aún no genera pasos</div>}
            {timeline.pasos.map(s => (
              <div className="step-row" key={s.paso}>
                <b>{PASO_LABEL[s.paso]}</b> — {s.status}
                <div className="t">Inicio: {fmt(s.started_at)} · Tomada: {fmt(s.taken_at)} · Fin: {fmt(s.finished_at)}</div>
                <div className="t">Atendió: {s.worker_name || '—'}</div>
              </div>
            ))}
            <button className="btn btn-green" style={{ width: '100%', marginTop: 14 }} onClick={() => setTimeline(null)}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Dashboard({ sesion }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    const load = () => fetch(`${API_WORKFLOW}/dashboard`, { headers: { Authorization: `Bearer ${sesion.token}` } })
      .then(r => r.json()).then(setData).catch(() => {})
    load()
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [])

  if (!data) return <div className="empty">Cargando dashboard…</div>
  const tiempos = data.tiempo_promedio_min_por_paso || {}
  const maxT = Math.max(...Object.values(tiempos).map(v => v || 0), 0.1)
  const trabajadores = Object.entries(data.tareas_completadas_por_trabajador || {}).sort((a, b) => b[1] - a[1])

  return (
    <div>
      <div className="cards">
        <div className="kpi gray"><div className="num">{data.tareas_por_estado?.PENDING ?? 0}</div>Pendientes</div>
        <div className="kpi red"><div className="num">{data.tareas_por_estado?.IN_PROGRESS ?? 0}</div>En curso</div>
        <div className="kpi"><div className="num">{data.tareas_por_estado?.DONE ?? 0}</div>Completadas</div>
      </div>

      <h3 className="section-title">⏱ Tiempo promedio por paso (minutos)</h3>
      {Object.entries(tiempos).map(([paso, min]) => (
        <div className="bar-row" key={paso}>
          <div className="lbl">{PASO_LABEL[paso]}</div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${min ? Math.max((min / maxT) * 100, 12) : 0}%` }}>
              {min != null ? `${min} min` : ''}
            </div>
          </div>
        </div>
      ))}

      <h3 className="section-title">🏆 Tareas completadas por trabajador</h3>
      {trabajadores.length === 0 && <div className="empty">Aún no hay tareas completadas</div>}
      {trabajadores.map(([nombre, n]) => (
        <div className="bar-row" key={nombre}>
          <div className="lbl">{nombre}</div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(n / trabajadores[0][1]) * 100}%` }}>{n}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function Admin({ sesion }) {
  const [usuarios, setUsuarios] = useState([])
  const [cargando, setCargando] = useState(true)
  const [nuevo, setNuevo] = useState({ nombre: '', email: '', role: 'COCINERO', titulo: '', password: '123456' })
  const [msg, setMsg] = useState('')
  const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${sesion.token}` }

  const cargar = () => {
    setCargando(true)
    fetch(`${API_USUARIOS}/usuarios`, { headers: auth })
      .then(r => r.json()).then(d => setUsuarios(d.usuarios || [])).catch(() => {})
      .finally(() => setCargando(false))
  }
  useEffect(() => { cargar() }, [])

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(''), 3000) }

  const actualizar = async (email, campos) => {
    const r = await fetch(`${API_USUARIOS}/usuarios/${encodeURIComponent(email)}`,
      { method: 'PATCH', headers: auth, body: JSON.stringify(campos) })
    const d = await r.json()
    if (!r.ok) return flash('⚠️ ' + (d.error || 'Error'))
    flash('✓ Actualizado'); cargar()
  }

  const eliminar = async (email) => {
    if (!confirm(`¿Eliminar a ${email}?`)) return
    const r = await fetch(`${API_USUARIOS}/usuarios/${encodeURIComponent(email)}`, { method: 'DELETE', headers: auth })
    const d = await r.json()
    if (!r.ok) return flash('⚠️ ' + (d.error || 'Error'))
    flash('✓ Eliminado'); cargar()
  }

  const crear = async () => {
    if (!nuevo.nombre || !nuevo.email) return flash('⚠️ Nombre y email requeridos')
    const r = await fetch(`${API_USUARIOS}/usuarios`, { method: 'POST', headers: auth, body: JSON.stringify(nuevo) })
    const d = await r.json()
    if (!r.ok) return flash('⚠️ ' + (d.error || 'Error'))
    flash('✓ Trabajador creado'); setNuevo({ nombre: '', email: '', role: 'COCINERO', titulo: '', password: '123456' }); cargar()
  }

  return (
    <div>
      <h3 className="section-title">⚙️ Gestión de personal · {sesion.tenant_id}</h3>
      {msg && <div className="admin-msg">{msg}</div>}

      <div className="admin-nuevo">
        <input placeholder="Nombre" value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} />
        <input placeholder="Email" value={nuevo.email} onChange={e => setNuevo({ ...nuevo, email: e.target.value })} />
        <select value={nuevo.role} onChange={e => setNuevo({ ...nuevo, role: e.target.value })}>
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <input placeholder="Título (opcional)" list="titulos" value={nuevo.titulo}
               onChange={e => setNuevo({ ...nuevo, titulo: e.target.value })} />
        <button className="btn btn-green" onClick={crear}>+ Crear</button>
      </div>
      <datalist id="titulos">{TITULOS_SUGERIDOS.map(t => <option key={t} value={t} />)}</datalist>

      {cargando ? <div className="empty">Cargando personal…</div> : (
        <table>
          <thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Título / Reconocimiento</th><th></th></tr></thead>
          <tbody>
            {usuarios.map(u => (
              <tr key={u.email}>
                <td><b>{u.nombre}</b></td>
                <td>{u.email}</td>
                <td>
                  <select value={u.role} onChange={e => actualizar(u.email, { role: e.target.value })}>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td>
                  <input className="titulo-input" list="titulos" defaultValue={u.titulo || ''}
                         placeholder="— sin título —"
                         onBlur={e => { if (e.target.value !== (u.titulo || '')) actualizar(u.email, { titulo: e.target.value }) }} />
                </td>
                <td><button className="btn btn-red btn-sm" onClick={() => eliminar(u.email)}>Eliminar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="admin-hint">El rol define qué tareas puede atender cada trabajador. El título es un reconocimiento visible en su panel. Los cambios se guardan al instante.</p>
    </div>
  )
}

const CATEGORIAS = ['pizzas', 'complementos', 'bebidas', 'postres']

function ProductosAdmin({ sesion }) {
  const [productos, setProductos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [msg, setMsg] = useState('')
  const [nuevo, setNuevo] = useState({ id: '', nombre: '', categoria: 'pizzas', precio: '', descripcion: '', image_key: '' })
  const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${sesion.token}` }
  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(''), 3000) }

  const cargar = () => {
    setCargando(true)
    fetch(`${API_PRODUCTOS}/productos?tenant_id=${sesion.tenant_id}`)
      .then(r => r.json()).then(d => setProductos(d.productos || [])).catch(() => {}).finally(() => setCargando(false))
  }
  useEffect(() => { cargar() }, [])

  const crear = async () => {
    if (!nuevo.id || !nuevo.nombre || !nuevo.precio) return flash('⚠️ id, nombre y precio requeridos')
    const r = await fetch(`${API_PRODUCTOS}/productos`, { method: 'POST', headers: auth, body: JSON.stringify(nuevo) })
    const d = await r.json()
    if (!r.ok) return flash('⚠️ ' + (d.error || 'Error'))
    flash('✓ Producto creado'); setNuevo({ id: '', nombre: '', categoria: 'pizzas', precio: '', descripcion: '', image_key: '' }); cargar()
  }
  const editar = async (pid, campos) => {
    const r = await fetch(`${API_PRODUCTOS}/productos/${pid}`, { method: 'PATCH', headers: auth, body: JSON.stringify(campos) })
    const d = await r.json()
    if (!r.ok) return flash('⚠️ ' + (d.error || 'Error'))
    flash('✓ Actualizado'); cargar()
  }
  const eliminar = async (pid) => {
    if (!confirm(`¿Eliminar el producto ${pid}?`)) return
    const r = await fetch(`${API_PRODUCTOS}/productos/${pid}`, { method: 'DELETE', headers: auth })
    if (!r.ok) return flash('⚠️ Error al eliminar')
    flash('✓ Eliminado'); cargar()
  }

  return (
    <div>
      <h3 className="section-title">🍕 Catálogo · {sesion.tenant_id}</h3>
      {msg && <div className="admin-msg">{msg}</div>}
      <div className="admin-nuevo">
        <input placeholder="id (ej. pz-veggie)" value={nuevo.id} onChange={e => setNuevo({ ...nuevo, id: e.target.value })} />
        <input placeholder="Nombre" value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} />
        <select value={nuevo.categoria} onChange={e => setNuevo({ ...nuevo, categoria: e.target.value })}>
          {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input placeholder="Precio" type="number" value={nuevo.precio} onChange={e => setNuevo({ ...nuevo, precio: e.target.value })} />
        <input placeholder="image_key (ej. pizzas/veggie.jpg)" value={nuevo.image_key} onChange={e => setNuevo({ ...nuevo, image_key: e.target.value })} />
        <button className="btn btn-green" onClick={crear}>+ Crear</button>
      </div>

      {cargando ? <div className="empty">Cargando catálogo…</div> : (
        <table>
          <thead><tr><th>Producto</th><th>Categoría</th><th>Precio (editable)</th><th></th></tr></thead>
          <tbody>
            {productos.map(p => (
              <tr key={p.product_id}>
                <td><b>{p.nombre}</b><div className="prod-id">{p.product_id}</div></td>
                <td>
                  <select value={p.categoria} onChange={e => editar(p.product_id, { categoria: e.target.value })}>
                    {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td>
                  <input className="titulo-input" type="number" defaultValue={Number(p.precio)}
                         onBlur={e => { if (Number(e.target.value) !== Number(p.precio)) editar(p.product_id, { precio: e.target.value }) }} />
                </td>
                <td><button className="btn btn-red btn-sm" onClick={() => eliminar(p.product_id)}>Eliminar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="admin-hint">El precio y la categoría se guardan al salir del campo. Las imágenes se suben al bucket S3 con la ruta indicada en image_key.</p>
    </div>
  )
}

function RolesRef() {
  return (
    <div>
      <h3 className="section-title">🎭 Roles del sistema</h3>
      <table>
        <thead><tr><th>Rol</th><th>Pasos que atiende</th><th>Descripción</th></tr></thead>
        <tbody>
          {ROL_DESC.map(r => (
            <tr key={r.rol}><td><b>{r.rol}</b></td><td>{r.atiende}</td><td>{r.desc}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="admin-hint">Los roles son fijos porque definen qué paso del flujo de trabajo atiende cada uno. Asigna roles a tus trabajadores en la pestaña Personal.</p>
    </div>
  )
}

function SuperAdmin({ sesion }) {
  const [data, setData] = useState(null)
  const [sedes, setSedes] = useState([])
  const [msg, setMsg] = useState('')
  const [nueva, setNueva] = useState({ id: '', nombre: '', direccion: '' })
  const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${sesion.token}` }
  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(''), 3000) }

  const cargar = () => {
    fetch(`${API_SEDES}/sedes/metricas`, { headers: auth }).then(r => r.json()).then(setData).catch(() => {})
    fetch(`${API_SEDES}/sedes`).then(r => r.json()).then(d => setSedes(d.sedes || [])).catch(() => {})
  }
  useEffect(() => { cargar(); const t = setInterval(cargar, 12000); return () => clearInterval(t) }, [])

  const crearSede = async () => {
    if (!nueva.id || !nueva.nombre) return flash('⚠️ id y nombre requeridos')
    const r = await fetch(`${API_SEDES}/sedes`, { method: 'POST', headers: auth, body: JSON.stringify(nueva) })
    const d = await r.json()
    if (!r.ok) return flash('⚠️ ' + (d.error || 'Error'))
    flash('✓ Sede creada'); setNueva({ id: '', nombre: '', direccion: '' }); cargar()
  }
  const toggle = async (s) => {
    const r = await fetch(`${API_SEDES}/sedes/${s.id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ activa: !s.activa }) })
    if (!r.ok) return flash('⚠️ Error')
    flash('✓ Sede actualizada'); cargar()
  }

  if (!data) return <div className="empty">Cargando métricas de la cadena…</div>
  const t = data.totales || {}

  return (
    <div>
      <h3 className="section-title">🏢 Vista de cadena — todas las sedes</h3>
      {msg && <div className="admin-msg">{msg}</div>}

      <div className="cards">
        <div className="kpi"><div className="num">{data.sedes?.length || 0}</div>Sedes</div>
        <div className="kpi gray"><div className="num">{t.trabajadores || 0}</div>Trabajadores</div>
        <div className="kpi red"><div className="num">{t.pedidos || 0}</div>Pedidos</div>
        <div className="kpi"><div className="num">{soles(t.ingresos)}</div>Ingresos</div>
      </div>

      <h3 className="section-title">Métricas por sede</h3>
      <table>
        <thead><tr><th>Sede</th><th>Estado</th><th>Trabajadores</th><th>Pedidos</th><th>Entregados</th><th>Ingresos</th></tr></thead>
        <tbody>
          {data.sedes?.map(s => (
            <tr key={s.id}>
              <td><b>{s.nombre}</b><div className="prod-id">{s.id}</div></td>
              <td><span className={`chip ${s.activa ? 'DELIVERED' : 'FAILED'}`}>{s.activa ? 'Activa' : 'Inactiva'}</span></td>
              <td>{s.trabajadores}</td>
              <td>{s.pedidos}</td>
              <td>{s.entregados}</td>
              <td>{soles(s.ingresos)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="section-title">Gestión de sedes</h3>
      <div className="admin-nuevo">
        <input placeholder="id (ej. pj-callao)" value={nueva.id} onChange={e => setNueva({ ...nueva, id: e.target.value })} />
        <input placeholder="Nombre" value={nueva.nombre} onChange={e => setNueva({ ...nueva, nombre: e.target.value })} />
        <input placeholder="Dirección" value={nueva.direccion} onChange={e => setNueva({ ...nueva, direccion: e.target.value })} />
        <button className="btn btn-green" onClick={crearSede}>+ Nueva sede</button>
      </div>
      <table>
        <thead><tr><th>Sede</th><th>Dirección</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          {sedes.map(s => (
            <tr key={s.id}>
              <td><b>{s.nombre}</b><div className="prod-id">{s.id}</div></td>
              <td>{s.direccion || '—'}</td>
              <td><span className={`chip ${s.activa ? 'DELIVERED' : 'FAILED'}`}>{s.activa ? 'Activa' : 'Inactiva'}</span></td>
              <td><button className="btn btn-sm btn-white" onClick={() => toggle(s)}>{s.activa ? 'Desactivar' : 'Activar'}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="admin-hint">Las sedes activas aparecen en el selector de las webs de clientes y trabajadores. Desactivar una sede la oculta sin borrar sus datos.</p>
    </div>
  )
}
