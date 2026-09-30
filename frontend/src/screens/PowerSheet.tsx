import { useEffect, useState } from 'react'
import { API } from '../api'
import { useAsync } from '../hooks'
import { Ic } from '../icons'
import { Overlay } from '../components/sheets'
import { useToast } from '../components/toast'
import type { ServerDetail } from '../types'

interface Row {
  key: string
  name: string
  hint: string
  kind: 'SOFT' | 'HARD' | '—'
  icon: React.ReactNode
  enabled: boolean
  disabledHint?: string
}

/**
 * Power sheet — every action arms on the first tap
 * and runs on the second; it disarms after 4 s or when the sheet closes.
 */
export default function PowerSheet({
  open,
  onClose,
  detail,
  desktop,
  onSent,
}: {
  open: boolean
  onClose: () => void
  detail: ServerDetail
  desktop?: boolean
  onSent: () => void
}) {
  const toast = useToast()
  const [armed, setArmed] = useState<string | null>(null)
  const [sent, setSent] = useState<{ id: number; command: string } | null>(null)
  const [pending, setPending] = useState(false)

  // Safety: an armed hard action must never survive closing the sheet
  // (reopening would run Power off / Reset on a single tap), and it
  // disarms by itself if the second tap doesn't come.
  useEffect(() => {
    if (!open) {
      setArmed(null)
      setSent(null)
    }
  }, [open])
  useEffect(() => {
    if (!armed) return
    const t = window.setTimeout(() => setArmed(null), 4000)
    return () => window.clearTimeout(t)
  }, [armed])

  const running = detail.status === 'running'
  const off = detail.status === 'off'
  const locked = detail.locked || !!detail.busy

  const rows: Row[] = [
    { key: 'reboot', name: 'Reboot', hint: 'ACPI reboot · OS restarts cleanly', kind: 'SOFT', icon: <Ic.Rotate />, enabled: running && !locked },
    { key: 'shutdown', name: 'Shut down', hint: 'ACPI power button · OS decides', kind: 'SOFT', icon: <Ic.Stop />, enabled: running && !locked },
    { key: 'poweroff', name: 'Power off', hint: 'Cuts power now · unsaved data is lost', kind: 'HARD', icon: <Ic.Power />, enabled: running && !locked },
    { key: 'reset', name: 'Reset', hint: 'Hard reset · like the reset button', kind: 'HARD', icon: <Ic.Refresh />, enabled: running && !locked },
    {
      key: 'poweron',
      name: 'Power on',
      hint: running ? 'Already running' : off ? 'Boot the server' : 'Action running',
      kind: off ? 'SOFT' : '—',
      icon: <Ic.Play />,
      enabled: off && !locked,
    },
  ]

  const send = (row: Row) => {
    if (!row.enabled || pending) return
    // every power action asks: first tap arms, second tap runs
    if (armed !== row.key) {
      setArmed(row.key)
      return
    }
    setArmed(null)
    setPending(true) // one request per tap burst — no double reboot
    void toast
      .runTracked(`${row.name} ${detail.name}`, API.action(detail.id, row.key))
      .then((res) => {
        if (res) {
          setSent({ id: res.action.id, command: res.action.command })
          onSent()
        }
      })
      .finally(() => setPending(false))
  }

  return (
    <Overlay open={open} onClose={onClose} kind={desktop ? 'dialog' : 'sheet'} label="Power">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '16px 16px 14px' }}>
        <div>
          <div className="eb">
            {detail.name} · {detail.status}
          </div>
          <h2 className="d" style={{ margin: '8px 0 0', fontSize: 30 }}>
            Power
          </h2>
        </div>
        <button type="button" className="btn btn-ico btn-bare" aria-label="Close" onClick={onClose}>
          <Ic.X />
        </button>
      </div>

      {rows.map((row) => {
        const isArmed = armed === row.key
        const st: React.CSSProperties = {
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          width: '100%',
          minHeight: 68,
          padding: '10px 16px',
          borderTop: '1px solid var(--line)',
          ...(isArmed ? { background: 'var(--accent)', color: 'var(--on-accent)' } : {}),
          ...(!row.enabled ? { opacity: 0.38, cursor: 'not-allowed' } : {}),
        }
        const icoSt: React.CSSProperties = {
          width: 36,
          height: 36,
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          border: `1px solid ${isArmed ? 'var(--on-accent)' : 'var(--line3)'}`,
        }
        const dim = isArmed ? 'var(--on-accent)' : 'var(--t3)'
        return (
          <button key={row.key} style={st} onClick={() => send(row)} disabled={!row.enabled || pending} type="button">
            <span style={icoSt}>{row.icon}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 16, fontWeight: 600, color: isArmed ? 'var(--on-accent)' : undefined }}>
                {isArmed ? `Tap again to ${row.name.toLowerCase()}` : row.name}
              </span>
              <span className="m" style={{ display: 'block', fontSize: 11, marginTop: 3, letterSpacing: '.02em', color: isArmed ? 'var(--on-accent)' : 'var(--t3)' }}>
                {row.hint}
              </span>
            </span>
            <span className="m" style={{ fontSize: 10, letterSpacing: '.14em', color: dim }}>
              {row.kind}
            </span>
          </button>
        )
      })}

      {sent && <SentRow actionId={sent.id} command={sent.command} />}

      <p className="m t3" style={{ margin: '14px 16px 30px', fontSize: 10.5, lineHeight: 1.6, letterSpacing: '.04em' }}>
        TAP ONCE TO ARM, AGAIN TO RUN. SOFT = THE OS SHUTS DOWN CLEANLY (ACPI); HARD = LIKE THE POWER BUTTON.
      </p>
    </Overlay>
  )
}

/** The blue in-sheet progress row once an action is on its way. */
function SentRow({ actionId, command }: { actionId: number; command: string }) {
  const st = useAsync(() => API.actionGet(actionId), [actionId], { pollMs: 1500 })
  const action = st.data
  const progress = action?.progress ?? 0
  const done = action && action.status !== 'running'
  return (
    <div style={{ margin: '12px 16px 0', padding: '12px 14px', border: `1px solid ${done ? (action.status === 'success' ? 'var(--run-line)' : 'var(--accent-line)') : 'var(--move-line)'}`, display: 'flex', alignItems: 'center', gap: 12 }}>
      <span className={done ? (action.status === 'success' ? 'sq sq-run' : 'sq sq-err') : 'sq sq-move'} />
      <span className="m" style={{ fontSize: 12, flex: 1 }}>
        {command} · {action?.status ?? 'running'}
      </span>
      <span className="m" style={{ fontSize: 12, color: done ? 'var(--t3)' : 'var(--move)' }}>
        {done ? action?.status : `${progress}%`}
      </span>
    </div>
  )
}
