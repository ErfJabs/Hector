import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { API } from '../api'
import { copyText, useAsync } from '../hooks'
import { Ic } from '../icons'
import { useToast } from '../components/toast'
import { duration } from '../format'
import type { ActionInfo } from '../types'

interface CreatedState {
  name?: string
  rootPassword?: string
  actions?: ActionInfo[]
}

/**
 * 10 · Created — the build is running, the root password exists once.
 * State arrives with navigation; a page refresh falls back to the server's
 * action history and simply has no password to show.
 */
export default function Created() {
  const { id } = useParams()
  const serverId = Number(id)
  const navigate = useNavigate()
  const toast = useToast()
  const { state } = useLocation() as { state: CreatedState | null }

  const detailSt = useAsync(() => API.server(serverId), [serverId], { pollMs: 5000 })

  const [actions, setActions] = useState<ActionInfo[]>(state?.actions ?? [])
  const [saved, setSaved] = useState(false)
  const [reveal, setReveal] = useState(false)

  // fallback after a refresh: show the latest create/start actions
  useEffect(() => {
    if (actions.length === 0 && detailSt.data) {
      const interesting = detailSt.data.actions.filter((a) => ['create_server', 'start_server'].includes(a.command)).slice(0, 2).reverse()
      if (interesting.length) setActions(interesting)
    }
  }, [actions.length, detailSt.data])

  // poll running actions
  useEffect(() => {
    if (!actions.some((a) => a.status === 'running')) return
    const timer = window.setInterval(() => {
      void Promise.all(actions.filter((a) => a.status === 'running').map((a) => API.actionGet(a.id).catch(() => a))).then((fresh) => {
        if (fresh.length === 0) return
        setActions((list) => list.map((a) => fresh.find((f) => f.id === a.id) ?? a))
      })
    }, 1500)
    return () => window.clearInterval(timer)
  }, [actions])

  const name = state?.name ?? detailSt.data?.name ?? `#${serverId}`
  const rootPassword = state?.rootPassword ?? ''
  const building = actions.some((a) => a.status === 'running') || (!actions.length && detailSt.data?.status !== 'running')
  const failed = actions.some((a) => a.status === 'error')

  const done = () => navigate(`/servers/${serverId}/overview`)

  return (
    <div className="page" style={{ paddingBottom: 120 }}>
      <div style={{ padding: '18px 16px 0' }}>
        <div className="eb">
          {name} · #{serverId}
        </div>
        <h1 className="d" style={{ margin: '10px 0 0', fontSize: 44 }}>
          {failed ? 'Failed' : building ? 'Building' : 'Ready'}
        </h1>
      </div>

      <section style={{ padding: '20px 16px 0' }}>
        <div className="card">
          {actions.map((a, i) => (
            <div key={a.id} style={{ padding: '12px 14px', borderBottom: i === actions.length - 1 ? undefined : '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className={a.status === 'error' ? 'sq sq-err' : a.status === 'running' ? 'sq sq-move' : 'sq sq-run'} />
                <span className="m" style={{ flex: 1, fontSize: 12 }}>
                  {a.command}
                </span>
                <span className="m" style={{ fontSize: 11, color: a.status === 'error' ? 'var(--accent-soft)' : a.status === 'running' ? 'var(--move)' : 'var(--t3)' }}>
                  {a.status === 'success' ? `DONE · ${duration(a.durationS)}` : a.status === 'error' ? `FAILED · ${a.errorCode || 'error'}` : `${a.progress}%`}
                </span>
              </div>
              {a.status === 'running' && (
                <div style={{ height: 6, background: 'var(--line)', marginTop: 10 }}>
                  <div className="hatch" style={{ width: `${a.progress}%`, height: 6 }} />
                </div>
              )}
              {a.status === 'error' && (
                <div className="m t3" style={{ fontSize: 11, margin: '6px 0 0 22px' }}>
                  {a.errorCode} · {a.errorMessage}
                </div>
              )}
            </div>
          ))}
          {actions.length === 0 && <div className="skel" style={{ height: 44 }} />}
        </div>
      </section>

      {rootPassword && (
        <section style={{ padding: '20px 16px 0' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="sq sq-err" style={{ width: 7, height: 7 }} />
            <span className="m" style={{ fontSize: 10.5, letterSpacing: '.14em', color: 'var(--accent-soft)', flex: 1 }}>ROOT PASSWORD</span>
            <span className="m" style={{ fontSize: 10.5, letterSpacing: '.14em', color: 'var(--accent-soft)' }}>SHOWN ONCE</span>
          </div>
          <div style={{ border: '1px solid var(--accent)', padding: 16, marginTop: 10 }}>
            <div className="m" style={{ fontSize: 15, lineHeight: 1.7, wordBreak: 'break-all' }}>
              {reveal ? rootPassword : '•••• •••• •••• •••• ••••'}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button type="button" className="btn" style={{ flex: 1 }} onClick={() => setReveal((v) => !v)}>
                <Ic.Eye />
                {reveal ? 'Hide' : 'Reveal'}
              </button>
              <button
                type="button"
                className="btn"
                style={{ flex: 1 }}
                onClick={() => {
                  void copyText(rootPassword).then((ok) =>
                    toast.push(ok ? { kind: 'success', title: 'Password copied' } : { kind: 'error', title: 'Copy failed — reveal it and copy by hand' }),
                  )
                }}
              >
                <Ic.Copy />
                Copy
              </button>
            </div>
          </div>
          <p className="t2" style={{ fontSize: 12.5, lineHeight: 1.5, margin: '12px 0 0' }}>
            Hetzner returns this only in the create response. Hector doesn't store it — save it now.
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, cursor: 'pointer' }}>
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--accent)', margin: 0 }} />
            <span style={{ fontSize: 15, fontWeight: 600 }}>I've saved the password</span>
          </label>
        </section>
      )}

      <div className="dock" style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 520, bottom: 0, padding: '14px 16px 24px', background: 'var(--bg)', borderTop: '1px solid var(--line)', zIndex: 20 }}>
        <button
          type="button"
          className={!rootPassword || saved ? 'btn btn-red' : 'btn btn-red btn-dis'}
          style={{ width: '100%', height: 54, fontSize: 13 }}
          disabled={!!rootPassword && !saved}
          onClick={done}
        >
          Done
        </button>
      </div>
    </div>
  )
}
