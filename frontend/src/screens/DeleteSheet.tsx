import { useEffect, useState } from 'react'
import { API, notifyChanged } from '../api'
import { useAsync } from '../hooks'
import { Ic } from '../icons'
import { Overlay } from '../components/sheets'
import { BTN, DialogButtons } from '../components/confirm'
import { useToast } from '../components/toast'
import type { ServerDetail } from '../types'

/**
 * Delete server — what goes with it, typed-name confirmation, hard delete.
 * Snapshot count comes from the images endpoint (`bound_to` = this server).
 */
export default function DeleteSheet({
  open,
  onClose,
  detail,
  desktop,
  onDeleted,
}: {
  open: boolean
  onClose: () => void
  detail: ServerDetail
  desktop?: boolean
  onDeleted: () => void
}) {
  const toast = useToast()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)

  const snapshots = useAsync(() => API.snapshots(detail.id), [detail.id], {
    skip: !open,
    cache: { key: `snapshots:${detail.id}`, ttlMs: 60000 },
  })
  const protectedServer = detail.protectDelete
  const match = typed === detail.name && !protectedServer

  // start clean every time the sheet opens
  useEffect(() => {
    if (!open) {
      setTyped('')
      setBusy(false)
    }
  }, [open])

  const rows = [
    { sq: 'sq sq-err', title: `Server and its ${detail.type.diskGb} GB disk`, sub: '', right: 'DELETED', tone: 'var(--accent-soft)' },
    ...(detail.ipv4
      ? [{ sq: 'sq sq-err', title: 'Primary IPv4', sub: `${detail.ipv4} · unless its auto-delete is off`, right: 'RELEASED', tone: 'var(--accent-soft)' }]
      : []),
    ...(detail.ipv6
      ? [{ sq: 'sq sq-err', title: 'Primary IPv6', sub: `${detail.ipv6} · unless its auto-delete is off`, right: 'RELEASED', tone: 'var(--accent-soft)' }]
      : []),
    {
      sq: 'sq sq-off',
      title: snapshots.data
        ? `${snapshots.data.count} snapshot${snapshots.data.count === 1 ? '' : 's'}`
        : snapshots.error
          ? 'Snapshots'
          : 'Counting snapshots…',
      sub: 'stay in the project · still billed',
      right: 'KEPT',
      tone: 'var(--t3)',
    },
  ]

  const remove = async () => {
    if (!match || busy) return
    setBusy(true)
    try {
      const res = await API.remove(detail.id)
      toast.trackAction(`Deleting ${detail.name}`, res.action)
      notifyChanged()
      onDeleted()
    } catch (err) {
      toast.push({ kind: 'error', title: `Delete ${detail.name} failed`, detail: err instanceof Error ? err.message : 'error' })
      setBusy(false)
    }
  }

  return (
    <Overlay open={open} onClose={onClose} kind={desktop ? 'dialog' : 'sheet'} label="Delete server">
      <div style={{ padding: '16px 16px 20px' }}>
        <div className="eb" style={{ color: 'var(--accent-soft)' }}>
          DELETE SERVER · CAN'T BE UNDONE
        </div>
        {/* exact name, exact case — the same string the field asks for */}
        <h2 className="m" style={{ margin: '8px 0 18px', fontSize: 24, fontWeight: 500, letterSpacing: '-0.01em', wordBreak: 'break-all' }}>
          '{detail.name}'
        </h2>

        <div style={{ borderTop: '1px solid var(--line)' }}>
          {rows.map((row) => (
            <div key={row.title} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--line-row)' }}>
              <span className={row.sq} style={{ marginTop: 4 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{row.title}</span>
                {row.sub && (
                  <span className="m t3" style={{ display: 'block', fontSize: 11, marginTop: 3 }}>
                    {row.sub}
                  </span>
                )}
              </span>
              <span className="m" style={{ fontSize: 10.5, letterSpacing: '.12em', color: row.tone, paddingTop: 2 }}>
                {row.right}
              </span>
            </div>
          ))}
        </div>

        {protectedServer && (
          <div style={{ display: 'flex', gap: 12, padding: '12px 14px', border: '1px solid var(--warn-line)', marginTop: 18, alignItems: 'flex-start' }}>
            <span style={{ color: 'var(--warn)' }}>
              <Ic.Shield />
            </span>
            <span style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--warn-text)' }}>
              Delete protection is on. Turn off <b>Delete &amp; rebuild lock</b> in Manage first.
            </span>
          </div>
        )}

        <div style={{ marginTop: 18 }}>
          <label className="lbl" htmlFor="del-confirm">
            Type <span style={{ color: 'var(--fg)', textTransform: 'none', letterSpacing: 0 }}>'{detail.name}'</span> to confirm
          </label>
          <div className="field" style={match ? { borderColor: 'var(--accent)' } : undefined}>
            <input
              id="del-confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              disabled={protectedServer}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void remove()
              }}
            />
          </div>
        </div>

        <DialogButtons
          onCancel={onClose}
          confirm={
            <button
              type="button"
              className={match && !busy ? 'btn' : 'btn btn-dis'}
              style={{ ...BTN, background: 'var(--danger)', borderColor: 'var(--danger)', color: '#FFFFFF' }}
              disabled={!match || busy}
              onClick={remove}
            >
              <Ic.Trash />
              Delete
            </button>
          }
        />
      </div>
    </Overlay>
  )
}
