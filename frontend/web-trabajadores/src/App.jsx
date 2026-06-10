import { useEffect, useState } from 'react'
import { API_USUARIOS, API_PEDIDOS, API_WORKFLOW, TENANTS, PASOS_POR_ROL, PASO_LABEL, STATUS_LABEL } from './config.js'

const fmt = (iso) => iso ? new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'

export default function App() {
  const [sesion, setSesion] = useState(() => JSON.parse(localStorage.getItem('sesion_trab') || 'null'))
  const [vista, setVista] = useState('tareas')

  if (!sesion) return <Login onLogin={s => { localStorage.setItem('sesion_trab', JSON.stringify(s)); setSesion(s) }} />

  const logout = () => { localStorage.removeItem('sesion_trab'); setSesion(null) }

  return (
    <div>
      <header className="header">
        <div className="logo">Papa Johns<small>Panel de trabajadores · {sesion.tenant_id}</small></div>
        <div>
          <span style={{ marginRight: 12 }}>{sesion.nombre} ({sesion.role})</span>
          <button className="btn btn-red" onClick={logout}>Salir</button>
        </div>
      </header>
      <nav className="nav">
        <button className={vista === 'tareas' ? 'active' : ''} onClick={() => setVista('tareas')}>Mis tareas</button>
        <button className={vista === 'pedidos' ? 'active' : ''} onClick={() => setVista('pedidos')}>Pedidos</button>
        <button className={vista === 'dashboard' ? 'active' : ''} onClick={() => setVista('dashboard')}>Dashboard</button>
      </nav>
      <main className="main">
        {vista === 'tareas' && <Tareas sesion={sesion} />}
        {vista === 'pedidos' && <Pedidos sesion={sesion} />}
        {vista === 'dashboard' && <Dashboard sesion={sesion} />}
      </main>
    </div>
  )
}

function Login({ onLogin }) {
  const [form, setForm] = useState({ tenant_id: TENANTS[0].id, email: '', password: '' })
  const [error, setError] = useState('')
  const submit = async () => {
    setError('')
    try {
      const r = await fetch(`${API_USUARIOS}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Credenciales inválidas')
      if (d.role === 'CLIENTE') throw new Error('Esta web es solo para trabajadores')
      onLogin({ token: d.token, nombre: d.nombre, role: d.role, tenant_id: d.tenant_id })
    } catch (e) { setError(e.message) }
  }
  return (
    <div className="login-page">
      <div className="login-box">
        <h1>Papa Johns</h1>
        <p>Panel de trabajadores</p>
        <select value={form.tenant_id} onChange={e => setForm(f => ({ ...f, tenant_id: e.target.value }))}>
          {TENANTS.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
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
