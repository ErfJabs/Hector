import type { ReactNode } from 'react'
import { Overlay } from './sheets'

/**
 * Explicit "are you sure" for actions that change a server in ways that
 * matter (rescue, rebuild, backups off, protection off, password reset).
 * Same buttons, same size, everywhere.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  eyebrow,
  title,
  children,
  confirmLabel,
  danger,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  eyebrow: string
  title: string
  children?: ReactNode
  confirmLabel: string
  danger?: boolean
}) {
  return (
    <Overlay open={open} onClose={onClose} kind="dialog" label={title} width={480}>
      <div style={{ padding: '16px 16px 20px' }}>
        <div className="eb" style={danger ? { color: 'var(--accent-soft)' } : undefined}>
          {eyebrow}
        </div>
        <h2 style={{ margin: '8px 0 0', fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>{title}</h2>
        {children && (
          <div className="t2" style={{ fontSize: 13.5, lineHeight: 1.55, marginTop: 10 }}>
            {children}
          </div>
        )}
        <DialogButtons
          onCancel={onClose}
          confirm={
            <button
              type="button"
              className={danger ? 'btn' : 'btn btn-red'}
              style={{ ...BTN, ...(danger ? { background: 'var(--danger)', borderColor: 'var(--danger)', color: '#FFFFFF' } : {}) }}
              onClick={() => {
                onClose()
                onConfirm()
              }}
            >
              {confirmLabel}
            </button>
          }
        />
      </div>
    </Overlay>
  )
}

/** Every dialog button: same height, same width share. */
export const BTN = { flex: 1, height: 48, justifyContent: 'center' } as const

export function DialogButtons({ onCancel, confirm }: { onCancel: () => void; confirm: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
      <button type="button" className="btn" style={BTN} onClick={onCancel}>
        Cancel
      </button>
      {confirm}
    </div>
  )
}
