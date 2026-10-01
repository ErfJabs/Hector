import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { API, ApiError, notifyChanged } from '../api'
import { Ic } from '../icons'
import type { ActionResult, Job } from '../types'

interface ToastItem {
  id: number
  kind: 'progress' | 'success' | 'error'
  title: string
  detail: string
  progress: number
  tag: string
  expanded: boolean
}

interface ToastAPI {
  push: (t: Partial<ToastItem> & { title: string }) => number
  update: (id: number, patch: Partial<ToastItem>) => void
  dismiss: (id: number) => void
  /** Track a running Hetzner action until it finishes. `notify` replaces the
   *  fleet-wide resync on settle — a volume action must not rebuild the fleet. */
  trackAction: (title: string, action: ActionResult['action'], notify?: () => void) => void
  /** Track a multi-step backend job (rescale). */
  trackJob: (serverId: number, title: string, job: Job) => void
  runTracked: (title: string, promise: Promise<ActionResult>) => Promise<ActionResult | null>
}

const ToastCtx = createContext<ToastAPI | null>(null)

export function useToast(): ToastAPI {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('ToastProvider missing')
  return ctx
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Stop polling when the answer can never change (gone, signed out) or the
 *  panel has been unreachable for a while — instead of spinning forever. */
const MAX_POLL_FAILURES = 20
/** done toasts leave quickly; errors stay a bit longer (both closable) */
const DONE_MS = 2000
const ERROR_MS = 7000
const fatal = (err: unknown) => err instanceof ApiError && (err.status === 401 || err.status === 403 || err.status === 404)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const push = useCallback((t: Partial<ToastItem> & { title: string }) => {
    const id = nextId.current++
    setToasts((list) => [
      ...list,
      {
        id,
        kind: t.kind ?? 'progress',
        title: t.title,
        detail: t.detail ?? '',
        progress: t.progress ?? 0,
        tag: t.tag ?? '',
        expanded: false,
      },
    ])
    return id
  }, [])

  const update = useCallback((id: number, patch: Partial<ToastItem>) => {
    setToasts((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }, [])

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const settle = useCallback(
    (id: number, ok: boolean, durationS: number, errorCode: string, errorMessage: string, notify: () => void = notifyChanged) => {
      notify() // the resource's state moved on: list + detail resync
      if (ok) {
        update(id, { kind: 'success', progress: 100, tag: durationS > 0 ? `${durationS} s` : '' })
        window.setTimeout(() => dismiss(id), DONE_MS)
      } else {
        update(id, {
          kind: 'error',
          detail: [errorCode, errorMessage].filter(Boolean).join(' · ') || 'action failed',
        })
        window.setTimeout(() => dismiss(id), ERROR_MS)
      }
    },
    [dismiss, update],
  )

  const trackAction = useCallback(
    (title: string, action: ActionResult['action'], notify: () => void = notifyChanged) => {
      const id = push({ kind: 'progress', title, progress: action.progress, tag: `${action.progress}%` })
      if (action.status !== 'running') {
        settle(id, action.status === 'success', action.durationS, action.errorCode, action.errorMessage, notify)
        return
      }
      void (async () => {
        let failures = 0
        for (;;) {
          await sleep(1500)
          try {
            const a = await API.actionGet(action.id)
            failures = 0
            update(id, { progress: a.progress, tag: `${a.progress}%` })
            if (a.status !== 'running') {
              settle(id, a.status === 'success', a.durationS, a.errorCode, a.errorMessage, notify)
              return
            }
          } catch (err) {
            if (fatal(err) || ++failures >= MAX_POLL_FAILURES) {
              settle(id, false, 0, 'unknown', 'lost track of this action — check the server', notify)
              return
            }
          }
        }
      })()
    },
    [push, settle, update],
  )

  const trackJob = useCallback(
    (serverId: number, title: string, job: Job) => {
      const id = push({ kind: 'progress', title, progress: 0, tag: '0%', detail: job.steps[0]?.key ?? '' })
      void (async () => {
        let failures = 0
        for (;;) {
          await sleep(2000)
          try {
            const j = await API.job(serverId)
            failures = 0
            if (!j) {
              // the job record is gone (panel restarted) — the Hetzner action may still run
              update(id, { kind: 'error', detail: 'job record lost · check the server state' })
              window.setTimeout(() => dismiss(id), ERROR_MS)
              return
            }
            const active = j.steps.find((s) => s.status === 'running') ?? j.steps[j.steps.length - 1]
            update(id, { progress: active?.progress ?? 0, tag: `${active?.progress ?? 0}%`, detail: active?.key ?? '' })
            if (j.status !== 'running') {
              notifyChanged()
              if (j.status === 'success') {
                update(id, { kind: 'success', detail: '', tag: '' })
                window.setTimeout(() => dismiss(id), DONE_MS)
              } else {
                const failed = j.steps.find((s) => s.status === 'error')
                update(id, { kind: 'error', detail: failed?.error ?? j.error })
                window.setTimeout(() => dismiss(id), ERROR_MS)
              }
              return
            }
          } catch (err) {
            if (fatal(err) || ++failures >= MAX_POLL_FAILURES) {
              update(id, { kind: 'error', detail: 'lost track of this job · check the server state' })
              window.setTimeout(() => dismiss(id), ERROR_MS)
              return
            }
          }
        }
      })()
    },
    [dismiss, push, update],
  )

  const runTracked = useCallback(
    async (title: string, promise: Promise<ActionResult>) => {
      try {
        const res = await promise
        notifyChanged() // show the server as busy right away
        trackAction(title, res.action)
        return res
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        const id = push({ kind: 'error', title, detail: message })
        window.setTimeout(() => dismiss(id), ERROR_MS)
        return null
      }
    },
    [dismiss, push, trackAction],
  )

  const api = useMemo<ToastAPI>(
    () => ({ push, update, dismiss, trackAction, trackJob, runTracked }),
    [push, update, dismiss, trackAction, trackJob, runTracked],
  )

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div
        className="toasts"
        aria-live="polite"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          zIndex: 90,
          pointerEvents: 'none',
          padding: '0 16px',
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            style={{
              pointerEvents: 'auto',
              width: '100%',
              maxWidth: 420,
              background: 'var(--toast)',
              border: `1px solid ${t.kind === 'error' ? 'var(--accent-line)' : 'var(--line3)'}`,
              padding: '12px 14px',
            }}
          >
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className={t.kind === 'success' ? 'sq sq-run' : t.kind === 'error' ? 'sq sq-err' : 'sq sq-move'} />
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{t.title}</span>
              {t.kind === 'progress' && (
                <span className="num" style={{ fontSize: 12, color: 'var(--move)' }}>
                  {t.tag}
                </span>
              )}
              {t.kind === 'success' && t.tag && (
                <span className="m t3" style={{ fontSize: 11 }}>
                  {t.tag}
                </span>
              )}
              {t.kind === 'error' && t.detail && (
                <button
                  type="button"
                  className="m"
                  style={{ fontSize: 11, letterSpacing: '.1em', color: 'var(--accent-soft)', height: 32 }}
                  aria-expanded={t.expanded}
                  onClick={() => update(t.id, { expanded: !t.expanded })}
                >
                  {t.expanded ? 'LESS' : 'DETAILS'}
                </button>
              )}
              <button
                type="button"
                className="btn btn-ico btn-bare"
                style={{ width: 32, height: 32, margin: '-6px -8px -6px 0', color: 'var(--t3)' }}
                aria-label="Dismiss"
                onClick={() => dismiss(t.id)}
              >
                <Ic.X />
              </button>
            </div>
            {t.kind === 'progress' && (
              <div style={{ height: 4, background: 'var(--line)', marginTop: 10 }}>
                <div className="hatch" style={{ width: `${t.progress}%`, height: 4 }} />
              </div>
            )}
            {t.kind === 'error' && t.detail && !t.expanded && (
              <div className="m t3" style={{ fontSize: 11, margin: '4px 0 0 20px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {t.detail}
              </div>
            )}
            {t.kind === 'error' && t.expanded && (
              <div className="m t3" style={{ fontSize: 11, margin: '6px 0 0 20px', whiteSpace: 'pre-wrap' }}>
                {t.detail}
              </div>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
