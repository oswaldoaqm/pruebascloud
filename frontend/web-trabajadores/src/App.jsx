import { useEffect, useState, useCallback } from 'react'
import {
  ListChecks, LayoutGrid, BarChart3, Users, Pizza, Shield, Building2,
  Moon, Sun, LogOut, Plus, Check, X, Clock, DollarSign, Package, TrendingUp,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import {
  API_USUARIOS, API_PEDIDOS, API_WORKFLOW, API_PRODUCTOS, API_SEDES,
  TENANTS, CENTRAL, PASOS_POR_ROL, PASO_LABEL, STATUS_LABEL, ROLES, ROL_DESC, TITULOS_SUGERIDOS,
} from './config.js'

const fmt = (iso) => iso ? new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '—'
const hace = (iso) => { if (!iso) return ''; const s = (Date.now() - new Date(iso)) / 1000; if (s < 45) return 'hace un momento'; if (s < 3600) return 'hace ' + Math.floor(s / 60) + ' min'; return 'hace ' + Math.floor(s / 3600) + ' h' }
const soles = (n) => 'S/ ' + Number(n || 0).toFixed(2)
const CHART = ['#1aa86b', '#e8730a', '#8a3ffc', '#1f6feb', '#e01a22', '#f5b800']
const STATUS_COLOR = { RECEIVED: '#8a8a8a', COOKING: '#e8730a', PACKING: '#8a3ffc', DELIVERING: '#1f6feb', DELIVERED: '#1aa86b', FAILED: '#e01a22' }

function useToasts() {
  const [toasts, setToasts] = useState([])
  const push = useCallback((msg, icon) => {
    const id = Math.random(); setToasts(t => [...t, { id, msg, icon }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2600)
  }, [])
  const view = <div className="toasts">{toasts.map(t => <div className="toast" key={t.id}>{t.icon}{t.msg}</div>)}</div>
  return [push, view]
}

function useConfirm() {
  const [st, setSt] = useState(null)
  const ask = (msg) => new Promise(res => setSt({ msg, res }))
  const done = (v) => { st.res(v); setSt(null) }
  const view = st && (
    <div className="modal-center"><div className="overlay" onClick={() => done(false)} />
      <div className="modal confirm">
        <p>{st.msg}</p>
        <div className="row">
          <button className="btn btn-ghost" onClick={() => done(false)}>Cancelar</button>
          <button className="btn btn-red" onClick={() => done(true)}>Confirmar</button>
        </div>
      </div>
    </div>
  )
  return [ask, view]
}

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light')
  const [sesion, setSesion] = useState(() => JSON.parse(localStorage.getItem('sesion_trab') || 'null'))
  const [vista, setVista] = useState('tareas')
  const [toast, toastView] = useToasts()
  const [ask, confirmView] = useConfirm()

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); localStorage.setItem('theme', theme) }, [theme])

  if (!sesion) return <><Login onLogin={s => { localStorage.setItem('sesion_trab', JSON.stringify(s)); setSesion(s) }} theme={theme} setTheme={setTheme} />{toastView}</>

  const logout = () => { localStorage.removeItem('sesion_trab'); setSesion(null) }
  const esAdmin = sesion.role === 'ADMIN'
  const esSuper = sesion.role === 'SUPERADMIN'

  const NAV = esSuper
    ? [{ id: 'cadena', label: 'Cadena', icon: Building2 }]
    : [
        { id: 'tareas', label: 'Mis tareas', icon: ListChecks },
        { id: 'pedidos', label: 'Pedidos', icon: LayoutGrid },
        { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
        ...(esAdmin ? [
          { id: 'admin', label: 'Personal', icon: Users },
          { id: 'productos', label: 'Productos', icon: Pizza },
          { id: 'roles', label: 'Roles', icon: Shield },
        ] : []),
      ]
  const activa = esSuper ? 'cadena' : vista

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="logo"><Pizza size={22} /><span>Papa Johns</span></div>
        <div className="sub">{esSuper ? 'Consola de cadena' : 'Operaciones'}</div>
        {NAV.map(n => (
          <button key={n.id} className={`nav-item ${activa === n.id ? 'active' : ''}`} onClick={() => setVista(n.id)}>
            <n.icon size={18} /><span>{n.label}</span>
          </button>
        ))}
        <div className="bottom">
          <button className="nav-item" onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}<span>{theme === 'light' ? 'Modo oscuro' : 'Modo claro'}</span>
          </button>
          <div className="side-user">
            <Shield size={18} />
            <div><b>{sesion.nombre.split(' ')[0]}</b>{sesion.titulo ? <span className="titulo-badge">{sesion.titulo}</span> : <span style={{ fontSize: '.75rem' }}>{sesion.role}</span>}</div>
          </div>
          <button className="nav-item" onClick={logout}><LogOut size={18} /><span>Salir</span></button>
        </div>
      </aside>

      <main className="content">
        {esSuper ? <SuperAdmin sesion={sesion} ask={ask} toast={toast} />
          : vista === 'tareas' ? <Tareas sesion={sesion} toast={toast} />
          : vista === 'pedidos' ? <Kanban sesion={sesion} toast={toast} ask={ask} />
          : vista === 'dashboard' ? <Dashboard sesion={sesion} />
          : vista === 'admin' && esAdmin ? <Admin sesion={sesion} ask={ask} toast={toast} />
          : vista === 'productos' && esAdmin ? <ProductosAdmin sesion={sesion} ask={ask} toast={toast} />
          : vista === 'roles' && esAdmin ? <RolesRef />
          : null}
      </main>
      {toastView}{confirmView}
    </div>
  )
}

function Login({ onLogin, theme, setTheme }) {
  const [sedes, setSedes] = useState(TENANTS)
  const [form, setForm] = useState({ tenant_id: TENANTS[0].id, email: '', password: '' })
  const [error, setError] = useState('')
  useEffect(() => {
    fetch(`${API_SEDES}/sedes`).then(r => r.json())
      .then(d => { if (d.sedes?.length) setSedes(d.sedes.map(s => ({ id: s.id, nombre: s.nombre }))) }).catch(() => {})
  }, [])
  const opciones = [...sedes, CENTRAL]
  const submit = async () => {
    setError('')
    try {
      const r = await fetch(`${API_USUARIOS}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Credenciales inválidas')
      if (d.role === 'CLIENTE') throw new Error('Esta web es solo para trabajadores')
      onLogin({ token: d.token, nombre: d.nombre, role: d.role, tenant_id: d.tenant_id, titulo: d.titulo || '' })
    } catch (e) { setError(e.message) }
  }
  return (
    <div className="login-page">
      <div className="login-box">
        <div className="logo"><Pizza size={26} />Papa Johns</div>
        <p>Consola de operaciones</p>
        <select className="field" value={form.tenant_id} onChange={e => setForm(f => ({ ...f, tenant_id: e.target.value }))}>
          {opciones.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
        <input className="field" placeholder="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        <input className="field" placeholder="Contraseña" type="password" value={form.password}
               onChange={e => setForm(f => ({ ...f, password: e.target.value }))} onKeyDown={e => e.key === 'Enter' && submit()} />
        {error && <div className="error">{error}</div>}
        <button className="btn btn-green" style={{ width: '100%', justifyContent: 'center' }} onClick={submit}>Entrar</button>
        <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />} Cambiar tema
        </button>
      </div>
    </div>
  )
}

function Tareas({ sesion, toast }) {
  const pasos = PASOS_POR_ROL[sesion.role] || []
  const [paso, setPaso] = useState(pasos[0])
  const [pendientes, setPendientes] = useState([])
  const [enCurso, setEnCurso] = useState([])
  const auth = { Authorization: `Bearer ${sesion.token}` }
  const cargar = () => {
    if (!paso) return
    fetch(`${API_WORKFLOW}/tareas?paso=${paso}&status=PENDING`, { headers: auth }).then(r => r.json()).then(d => setPendientes(d.tareas || [])).catch(() => {})
    fetch(`${API_WORKFLOW}/tareas?paso=${paso}&status=IN_PROGRESS`, { headers: auth }).then(r => r.json()).then(d => setEnCurso(d.tareas || [])).catch(() => {})
  }
  useEffect(() => { cargar(); const t = setInterval(cargar, 5000); return () => clearInterval(t) }, [paso])
  const accion = async (oid, tipo) => {
    const r = await fetch(`${API_WORKFLOW}/tareas/${oid}/${paso}/${tipo}`, { method: 'POST', headers: auth })
    const d = await r.json(); if (!r.ok) toast('⚠️ ' + (d.error || 'Error')); else toast(tipo === 'tomar' ? 'Tarea tomada' : 'Tarea completada', <Check size={16} />)
    cargar()
  }
  if (!pasos.length) return <div className="empty">Tu rol no atiende tareas del flujo.</div>
  return (
    <div>
      <h1 className="page-title">Mis tareas</h1>
      <p className="page-sub">Atiende los pedidos en orden de llegada.</p>
      <div className="paso-tabs">{pasos.map(p => <button key={p} className={p === paso ? 'active' : ''} onClick={() => setPaso(p)}>{PASO_LABEL[p]}</button>)}</div>
      <div className="cols">
        <div className="col">
          <h3><Clock size={16} /> Pendientes (FIFO)</h3>
          {pendientes.length === 0 && <div className="empty">Sin tareas pendientes</div>}
          {pendientes.map(t => (
            <div className="tarea" key={t.order_id}>
              <div>
                <b>#{t.order_id}</b> <span className={`chip ${t.origin}`}>{t.origin}</span>
                <div className="info">🍕 {t.items_resumen || '—'}</div>
                <div className="info">{t.cliente ? `${t.cliente} · ` : ''}llegó {hace(t.started_at)}</div>
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
                <div className="info">🍕 {t.items_resumen || '—'}</div>
                <div className="info">Por {t.worker_name} · {hace(t.taken_at)}</div>
              </div>
              <button className="btn btn-red" onClick={() => accion(t.order_id, 'completar')}>Completar</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const KCOLS = ['RECEIVED', 'COOKING', 'PACKING', 'DELIVERING', 'DELIVERED']

function Kanban({ sesion, toast, ask }) {
  const [pedidos, setPedidos] = useState([])
  const [timeline, setTimeline] = useState(null)
  const [q, setQ] = useState('')
  const auth = { Authorization: `Bearer ${sesion.token}` }
  const filtrar = (lista) => {
    const t = q.trim().toLowerCase()
    if (!t) return lista
    return lista.filter(p =>
      p.order_id?.toLowerCase().includes(t) ||
      (p.cliente?.nombre || '').toLowerCase().includes(t) ||
      (p.origin || '').toLowerCase().includes(t) ||
      (p.items || []).some(i => (i.nombre || '').toLowerCase().includes(t)))
  }
  const cargar = () => fetch(`${API_PEDIDOS}/pedidos`, { headers: auth }).then(r => r.json()).then(d => setPedidos(d.pedidos || [])).catch(() => {})
  useEffect(() => { cargar(); const t = setInterval(cargar, 6000); return () => clearInterval(t) }, [])
  const verTimeline = async (oid, status) => {
    const r = await fetch(`${API_WORKFLOW}/tareas/${oid}`, { headers: auth }); const d = await r.json()
    setTimeline({ order_id: oid, status, pasos: d.pasos || [] })
  }
  const cancelar = async (oid) => {
    if (!await ask(`¿Cancelar el pedido #${oid}? Se notificará a Rappi si corresponde.`)) return
    const r = await fetch(`${API_PEDIDOS}/pedidos/${oid}/cancelar`, { method: 'POST', headers: auth })
    const d = await r.json()
    if (!r.ok) return toast('⚠️ ' + (d.error || 'No se pudo cancelar'))
    toast('Pedido cancelado', <Check size={16} />); setTimeline(null); cargar()
  }
  return (
    <div>
      <h1 className="page-title">Pedidos en vivo</h1>
      <p className="page-sub">El tablero se actualiza solo conforme avanza el flujo de trabajo.</p>
      <input className="field" style={{ maxWidth: 340, marginBottom: 16 }} placeholder="🔎 Buscar por #id, cliente, origen o producto…"
             value={q} onChange={e => setQ(e.target.value)} />
      <div className="kanban">
        {KCOLS.map(col => {
          const items = filtrar(pedidos.filter(p => p.status === col))
          return (
            <div className="kcol" key={col}>
              <div className="kcol-head" style={{ borderColor: STATUS_COLOR[col] }}>
                <span style={{ color: STATUS_COLOR[col] }}>{STATUS_LABEL[col]}</span>
                <span className="kcol-count">{items.length}</span>
              </div>
              <div className="kcol-body">
                {items.map(p => (
                  <div className="kcard" key={p.order_id} onClick={() => verTimeline(p.order_id, p.status)}>
                    <div className="kc-top"><b>#{p.order_id}</b><span className={`chip ${p.origin}`}>{p.origin}</span></div>
                    <div className="kc-meta">{(p.items || []).map(i => `${i.cant}x ${i.nombre}`).join(', ') || '—'}</div>
                    <div className="kc-meta">{p.cliente?.nombre || '—'} · {fmt(p.created_at)}</div>
                    <div className="kc-total">{soles(p.total)}</div>
                  </div>
                ))}
                {items.length === 0 && <div className="empty" style={{ padding: 18, fontSize: '.8rem' }}>—</div>}
              </div>
            </div>
          )
        })}
      </div>
      {timeline && (
        <div className="modal-center"><div className="overlay" onClick={() => setTimeline(null)} />
          <div className="modal">
            <button className="icon-btn close" onClick={() => setTimeline(null)}><X size={18} /></button>
            <h2>Timeline #{timeline.order_id}</h2>
            {(() => {
              const done = timeline.pasos.filter(s => s.finished_at)
              if (timeline.pasos.length === 0) return null
              const ini = timeline.pasos[0]?.started_at
              const fin = done.length === timeline.pasos.length && done.length ? done[done.length - 1].finished_at : null
              const mins = ini && fin ? ((new Date(fin) - new Date(ini)) / 60000).toFixed(1) : null
              return <p className="page-sub" style={{ marginBottom: 12 }}>{mins ? `⏱ Tiempo total: ${mins} min` : '⏳ Pedido en curso…'}</p>
            })()}
            {timeline.pasos.length === 0 && <div className="empty">El workflow aún no genera pasos.</div>}
            {timeline.pasos.map(s => (
              <div className="step-row" key={s.paso}>
                <b>{PASO_LABEL[s.paso] || s.paso}</b> — {s.status}
                <div className="t">Inicio {fmt(s.started_at)} · Tomada {fmt(s.taken_at)} · Fin {fmt(s.finished_at)}</div>
                <div className="t">Atendió: {s.worker_name || '—'}</div>
              </div>
            ))}
            {!['DELIVERED', 'FAILED'].includes(timeline.status) && (
              <button className="btn btn-red" style={{ width: '100%', justifyContent: 'center', marginTop: 14 }} onClick={() => cancelar(timeline.order_id)}>
                Cancelar pedido
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function tooltipStyle() {
  return { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)' }
}

function Dashboard({ sesion }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    const load = () => fetch(`${API_WORKFLOW}/dashboard`, { headers: { Authorization: `Bearer ${sesion.token}` } }).then(r => r.json()).then(setData).catch(() => {})
    load(); const t = setInterval(load, 10000); return () => clearInterval(t)
  }, [])
  if (!data) return <div className="empty">Cargando dashboard…</div>
  const est = data.tareas_por_estado || {}
  const tiempos = Object.entries(data.tiempo_promedio_min_por_paso || {}).map(([paso, min]) => ({ paso: PASO_LABEL[paso]?.split(' ')[1] || paso, min: min || 0 }))
  const estados = Object.entries(est).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }))
  const trab = Object.entries(data.tareas_completadas_por_trabajador || {}).sort((a, b) => b[1] - a[1])
  return (
    <div>
      <h1 className="page-title">Dashboard de la sede</h1>
      <p className="page-sub">{sesion.tenant_id} · se actualiza cada 10s</p>
      <div className="cards">
        <KPI icon={Clock} color="#8a8a8a" label="Pendientes" value={est.PENDING ?? 0} />
        <KPI icon={Package} color="#e8730a" label="En curso" value={est.IN_PROGRESS ?? 0} />
        <KPI icon={Check} color="#1aa86b" label="Completadas" value={est.DONE ?? 0} />
      </div>
      <div className="charts">
        <div className="chart-card">
          <h3>⏱ Tiempo promedio por paso (min)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={tiempos}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="paso" tick={{ fill: '#94a39b', fontSize: 12 }} />
              <YAxis tick={{ fill: '#94a39b', fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle()} />
              <Bar dataKey="min" fill="#1aa86b" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card">
          <h3>📊 Tareas por estado</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={estados} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                {estados.map((e, i) => <Cell key={i} fill={CHART[i % CHART.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle()} /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card tall">
          <h3>🏆 Tareas completadas por trabajador</h3>
          {trab.length === 0 && <div className="empty">Aún no hay tareas completadas.</div>}
          {trab.map(([nombre, n]) => (
            <div className="bar-row" key={nombre}>
              <div className="lbl">{nombre}</div>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${(n / trab[0][1]) * 100}%` }}>{n}</div></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function KPI({ icon: Icon, color, label, value }) {
  return (
    <div className="kpi">
      <div className="kpi-top">{label}<span className="kpi-ic" style={{ background: color }}><Icon size={18} /></span></div>
      <div className="num">{value}</div>
    </div>
  )
}

function Admin({ sesion, ask, toast }) {
  const [usuarios, setUsuarios] = useState([]); const [cargando, setCargando] = useState(true)
  const [q, setQ] = useState(''); const [rolF, setRolF] = useState('TODOS')
  const [nuevo, setNuevo] = useState({ nombre: '', email: '', role: 'COCINERO', titulo: '', password: '123456' })
  const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${sesion.token}` }
  const cargar = () => { setCargando(true); fetch(`${API_USUARIOS}/usuarios`, { headers: auth }).then(r => r.json()).then(d => setUsuarios(d.usuarios || [])).catch(() => {}).finally(() => setCargando(false)) }
  useEffect(() => { cargar() }, [])
  const actualizar = async (email, campos) => { const r = await fetch(`${API_USUARIOS}/usuarios/${encodeURIComponent(email)}`, { method: 'PATCH', headers: auth, body: JSON.stringify(campos) }); const d = await r.json(); if (!r.ok) return toast('⚠️ ' + (d.error || 'Error')); toast('Actualizado', <Check size={16} />); cargar() }
  const cambiarRol = async (email, role) => { if (role === 'CLIENTE' && !await ask(`¿Quitar a ${email} del personal? Volverá a ser CLIENTE.`)) return; actualizar(email, { role }) }
  const eliminar = async (email) => { if (!await ask(`¿Eliminar a ${email}?`)) return; const r = await fetch(`${API_USUARIOS}/usuarios/${encodeURIComponent(email)}`, { method: 'DELETE', headers: auth }); const d = await r.json(); if (!r.ok) return toast('⚠️ ' + (d.error || 'Error')); toast('Eliminado'); cargar() }
  const crear = async () => { if (!nuevo.nombre || !nuevo.email) return toast('⚠️ Nombre y email requeridos'); const body = { ...nuevo, password: nuevo.password || '123456' }; const r = await fetch(`${API_USUARIOS}/usuarios`, { method: 'POST', headers: auth, body: JSON.stringify(body) }); const d = await r.json(); if (!r.ok) return toast('⚠️ ' + (d.error || 'Error')); toast(`Trabajador creado (contraseña: ${body.password})`, <Check size={16} />); setNuevo({ nombre: '', email: '', role: 'COCINERO', titulo: '', password: '123456' }); cargar() }
  const ROLES_STAFF = ['COCINERO', 'DESPACHADOR', 'REPARTIDOR', 'ADMIN']
  const t = q.trim().toLowerCase()
  const visibles = usuarios.filter(u =>
    (rolF === 'TODOS' || u.role === rolF) &&
    (!t || (u.nombre || '').toLowerCase().includes(t) || (u.email || '').toLowerCase().includes(t) || (u.titulo || '').toLowerCase().includes(t)))
  return (
    <div>
      <h1 className="page-title">Gestión de personal</h1>
      <p className="page-sub">{sesion.tenant_id} · solo se muestra el personal (los clientes no aparecen aquí)</p>
      <div className="admin-nuevo">
        <input placeholder="Nombre" value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} />
        <input placeholder="Email" value={nuevo.email} onChange={e => setNuevo({ ...nuevo, email: e.target.value })} />
        <select value={nuevo.role} onChange={e => setNuevo({ ...nuevo, role: e.target.value })}>{ROLES_STAFF.map(r => <option key={r} value={r}>{r}</option>)}</select>
        <select value={nuevo.titulo} onChange={e => setNuevo({ ...nuevo, titulo: e.target.value })}>
          <option value="">Sin título</option>
          {TITULOS_SUGERIDOS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input placeholder="Contraseña (def. 123456)" value={nuevo.password} onChange={e => setNuevo({ ...nuevo, password: e.target.value })} />
        <button className="btn btn-green" onClick={crear}><Plus size={16} />Crear</button>
      </div>
      <div className="filtros">
        <input className="field" style={{ maxWidth: 280, margin: 0 }} placeholder="🔎 Buscar por nombre, email o título…" value={q} onChange={e => setQ(e.target.value)} />
        <select className="field" style={{ maxWidth: 180, margin: 0 }} value={rolF} onChange={e => setRolF(e.target.value)}>
          <option value="TODOS">Todos los roles</option>
          {ROLES_STAFF.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <span className="page-sub" style={{ margin: 0 }}>{visibles.length} de {usuarios.length}</span>
      </div>
      {cargando ? <div className="empty">Cargando…</div> : visibles.length === 0 ? <div className="empty">Sin resultados.</div> : (
        <table>
          <thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Título</th><th></th></tr></thead>
          <tbody>{visibles.map(u => (
            <tr key={u.email}>
              <td><b>{u.nombre}</b></td><td>{u.email}</td>
              <td><select value={u.role} onChange={e => cambiarRol(u.email, e.target.value)}>
                {ROLES_STAFF.map(r => <option key={r} value={r}>{r}</option>)}
                <option value="CLIENTE">CLIENTE (quitar de staff)</option>
              </select></td>
              <td><select className="inline-input" value={u.titulo || ''} onChange={e => actualizar(u.email, { titulo: e.target.value })}>
                <option value="">— sin título —</option>
                {[...new Set([...(u.titulo ? [u.titulo] : []), ...TITULOS_SUGERIDOS])].map(t => <option key={t} value={t}>{t}</option>)}
              </select></td>
              <td><button className="btn btn-red btn-sm" onClick={() => eliminar(u.email)}>Eliminar</button></td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <p className="admin-hint">El trabajador inicia sesión con el <b>email</b> que registras aquí y la <b>contraseña</b> indicada (por defecto <b>123456</b>), eligiendo esta misma sede. El rol define qué tareas atiende; cambiarlo a CLIENTE lo quita del personal. El título es un reconocimiento visible en su panel.</p>
    </div>
  )
}

const CATEGORIAS = ['pizzas', 'complementos', 'bebidas', 'postres']

function ProductosAdmin({ sesion, ask, toast }) {
  const [productos, setProductos] = useState([]); const [cargando, setCargando] = useState(true)
  const [nuevo, setNuevo] = useState({ id: '', nombre: '', categoria: 'pizzas', precio: '', descripcion: '', image_key: '' })
  const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${sesion.token}` }
  const cargar = () => { setCargando(true); fetch(`${API_PRODUCTOS}/productos?tenant_id=${sesion.tenant_id}`).then(r => r.json()).then(d => setProductos(d.productos || [])).catch(() => {}).finally(() => setCargando(false)) }
  useEffect(() => { cargar() }, [])
  const crear = async () => { if (!nuevo.id || !nuevo.nombre || !nuevo.precio) return toast('⚠️ id, nombre y precio requeridos'); const r = await fetch(`${API_PRODUCTOS}/productos`, { method: 'POST', headers: auth, body: JSON.stringify(nuevo) }); const d = await r.json(); if (!r.ok) return toast('⚠️ ' + (d.error || 'Error')); toast('Producto creado', <Check size={16} />); setNuevo({ id: '', nombre: '', categoria: 'pizzas', precio: '', descripcion: '', image_key: '' }); cargar() }
  const editar = async (pid, campos) => { const r = await fetch(`${API_PRODUCTOS}/productos/${pid}`, { method: 'PATCH', headers: auth, body: JSON.stringify(campos) }); const d = await r.json(); if (!r.ok) return toast('⚠️ ' + (d.error || 'Error')); toast('Actualizado', <Check size={16} />); cargar() }
  const eliminar = async (pid) => { if (!await ask(`¿Eliminar el producto ${pid}?`)) return; const r = await fetch(`${API_PRODUCTOS}/productos/${pid}`, { method: 'DELETE', headers: auth }); if (!r.ok) return toast('⚠️ Error'); toast('Eliminado'); cargar() }
  return (
    <div>
      <h1 className="page-title">Catálogo</h1>
      <p className="page-sub">{sesion.tenant_id}</p>
      <div className="admin-nuevo">
        <input placeholder="id (pz-veggie)" value={nuevo.id} onChange={e => setNuevo({ ...nuevo, id: e.target.value })} />
        <input placeholder="Nombre" value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} />
        <select value={nuevo.categoria} onChange={e => setNuevo({ ...nuevo, categoria: e.target.value })}>{CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}</select>
        <input placeholder="Precio" type="number" value={nuevo.precio} onChange={e => setNuevo({ ...nuevo, precio: e.target.value })} />
        <input placeholder="image_key (pizzas/veggie.jpg)" value={nuevo.image_key} onChange={e => setNuevo({ ...nuevo, image_key: e.target.value })} />
        <button className="btn btn-green" onClick={crear}><Plus size={16} />Crear</button>
      </div>
      {cargando ? <div className="empty">Cargando…</div> : (
        <table>
          <thead><tr><th>Producto</th><th>Categoría</th><th>Precio</th><th></th></tr></thead>
          <tbody>{productos.map(p => (
            <tr key={p.product_id}>
              <td><b>{p.nombre}</b><div className="prod-id">{p.product_id}</div></td>
              <td><select value={p.categoria} onChange={e => editar(p.product_id, { categoria: e.target.value })}>{CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}</select></td>
              <td><input className="inline-input" type="number" defaultValue={Number(p.precio)} onBlur={e => { if (Number(e.target.value) !== Number(p.precio)) editar(p.product_id, { precio: e.target.value }) }} /></td>
              <td><button className="btn btn-red btn-sm" onClick={() => eliminar(p.product_id)}>Eliminar</button></td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <p className="admin-hint">Precio y categoría se guardan al salir del campo. Sube las imágenes al bucket S3 con la ruta de image_key.</p>
    </div>
  )
}

function RolesRef() {
  return (
    <div>
      <h1 className="page-title">Roles del sistema</h1>
      <p className="page-sub">Referencia de permisos por rol</p>
      <table>
        <thead><tr><th>Rol</th><th>Pasos que atiende</th><th>Descripción</th></tr></thead>
        <tbody>{ROL_DESC.map(r => <tr key={r.rol}><td><b>{r.rol}</b></td><td>{r.atiende}</td><td>{r.desc}</td></tr>)}</tbody>
      </table>
      <p className="admin-hint">Los roles son fijos porque definen qué paso del flujo atiende cada uno. Asigna roles en la pestaña Personal.</p>
    </div>
  )
}

function SuperAdmin({ sesion, ask, toast }) {
  const [data, setData] = useState(null)
  const [nueva, setNueva] = useState({ id: '', nombre: '', direccion: '' })
  const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${sesion.token}` }
  const sedes = data?.sedes || []
  const cargar = () => fetch(`${API_SEDES}/sedes/metricas`, { headers: auth }).then(r => r.json()).then(setData).catch(() => {})
  useEffect(() => { cargar(); const t = setInterval(cargar, 12000); return () => clearInterval(t) }, [])
  const crearSede = async () => { if (!nueva.id || !nueva.nombre) return toast('⚠️ id y nombre requeridos'); const r = await fetch(`${API_SEDES}/sedes`, { method: 'POST', headers: auth, body: JSON.stringify(nueva) }); const d = await r.json(); if (!r.ok) return toast('⚠️ ' + (d.error || 'Error')); toast('Sede creada', <Check size={16} />); setNueva({ id: '', nombre: '', direccion: '' }); cargar() }
  const toggle = async (s) => { if (s.activa && !await ask(`¿Desactivar ${s.nombre}? Dejará de aparecer en los selectores (sus datos se conservan).`)) return; const r = await fetch(`${API_SEDES}/sedes/${s.id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ activa: !s.activa }) }); if (!r.ok) return toast('⚠️ Error'); toast('Sede actualizada', <Check size={16} />); cargar() }

  if (!data) return <div className="empty">Cargando métricas de la cadena…</div>
  const t = data.totales || {}
  const ingresosSede = sedes.map(s => ({ sede: s.nombre.replace('Papa Johns - ', ''), ingresos: Number(s.ingresos || 0), pedidos: s.pedidos }))
  const estadosAgg = {}
  sedes.forEach(s => Object.entries(s.pedidos_por_estado || {}).forEach(([k, v]) => { estadosAgg[k] = (estadosAgg[k] || 0) + v }))
  const estadosData = Object.entries(estadosAgg).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }))

  return (
    <div>
      <h1 className="page-title">Vista de cadena</h1>
      <p className="page-sub">Todas las sedes · se actualiza cada 12s</p>
      <div className="cards">
        <KPI icon={Building2} color="#1f6feb" label="Sedes" value={sedes.length} />
        <KPI icon={Users} color="#8a8a8a" label="Trabajadores" value={t.trabajadores || 0} />
        <KPI icon={Package} color="#e8730a" label="Pedidos" value={t.pedidos || 0} />
        <KPI icon={DollarSign} color="#1aa86b" label="Ingresos" value={soles(t.ingresos)} />
      </div>
      <div className="charts">
        <div className="chart-card">
          <h3><TrendingUp size={16} style={{ verticalAlign: 'middle' }} /> Ingresos por sede</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={ingresosSede}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="sede" tick={{ fill: '#94a39b', fontSize: 11 }} /><YAxis tick={{ fill: '#94a39b', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle()} formatter={v => soles(v)} />
              <Bar dataKey="ingresos" fill="#1aa86b" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card">
          <h3>📦 Pedidos por sede</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={ingresosSede}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="sede" tick={{ fill: '#94a39b', fontSize: 11 }} /><YAxis tick={{ fill: '#94a39b', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle()} />
              <Bar dataKey="pedidos" fill="#1f6feb" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card">
          <h3>📊 Pedidos por estado (cadena)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={estadosData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={82} paddingAngle={3}>
                {estadosData.map((e, i) => <Cell key={i} fill={STATUS_COLOR[e.name] || CHART[i % CHART.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle()} /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <h2 className="section-title">Gestión de sedes</h2>
      <div className="admin-nuevo">
        <input placeholder="id (pj-callao)" value={nueva.id} onChange={e => setNueva({ ...nueva, id: e.target.value })} />
        <input placeholder="Nombre" value={nueva.nombre} onChange={e => setNueva({ ...nueva, nombre: e.target.value })} />
        <input placeholder="Dirección" value={nueva.direccion} onChange={e => setNueva({ ...nueva, direccion: e.target.value })} />
        <button className="btn btn-green" onClick={crearSede}><Plus size={16} />Nueva sede</button>
      </div>
      <table>
        <thead><tr><th>Sede</th><th>Trabajadores</th><th>Pedidos</th><th>Ingresos</th><th>Estado</th><th></th></tr></thead>
        <tbody>{sedes.map(s => (
          <tr key={s.id}>
            <td><b>{s.nombre}</b><div className="prod-id">{s.id}</div></td>
            <td>{s.trabajadores}</td><td>{s.pedidos}</td><td>{soles(s.ingresos)}</td>
            <td><span className={`chip ${s.activa ? 'activa' : 'inactiva'}`}>{s.activa ? 'Activa' : 'Inactiva'}</span></td>
            <td><button className="btn btn-ghost btn-sm" onClick={() => toggle(s)}>{s.activa ? 'Desactivar' : 'Activar'}</button></td>
          </tr>
        ))}</tbody>
      </table>
      <p className="admin-hint">Las sedes activas aparecen en los selectores de las webs. Desactivar oculta la sede sin borrar sus datos.</p>
    </div>
  )
}
