import { useEffect, useRef, type ReactNode } from 'react'
import { useIsDesktop } from '../hooks'

/**
 * Overlay — mobile: bottom sheet with a grab handle; desktop: right-hand
 * sheet (~700px) or centered dialog. The design system uses bottom sheets
 * on phones, right sheets/dialogs on desktop (foundations).
 */
export function Overlay({
  open,
  onClose,
  kind = 'sheet',
  label,
  width = 560,
  children,
}: {
  open: boolean
  onClose: () => void
  kind?: 'sheet' | 'dialog'
  label: string
  /** desktop dialog width (content-heavy pickers want more) */
  width?: number
  children: ReactNode
}) {
  const desktop = useIsDesktop()
  const panel = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    // Capture phase + stopPropagation: Escape closes only the top-most layer,
    // not the server sheet underneath as well.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      closeRef.current()
    }
    window.addEventListener('keydown', onKey, true)
    // The page behind must not scroll while a sheet is up (iOS rubber-band).
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // only the dialog's own text can be selected while it's open
    document.body.classList.add('modal-open')
    const prevFocus = document.activeElement as HTMLElement | null
    panel.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = prevOverflow
      if (!document.querySelector('[role="dialog"][aria-modal="true"]:not([data-closing])')) document.body.classList.remove('modal-open')
      prevFocus?.focus?.()
    }
  }, [open])

  if (!open) return null

  const desktopKind = kind === 'dialog' ? 'dialog' : 'sheet'

  let panelStyle: React.CSSProperties
  if (!desktop) {
    panelStyle = {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      maxHeight: '92%',
      paddingBottom: 'env(safe-area-inset-bottom)',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--card)',
      borderTop: '1px solid var(--line3)',
    }
  } else if (desktopKind === 'sheet') {
    panelStyle = {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      width: 700,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--panel)',
      borderLeft: '1px solid var(--line3)',
    }
  } else {
    panelStyle = {
      position: 'relative',
      width,
      maxWidth: '94vw',
      maxHeight: '86%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--card)',
      border: '1px solid var(--line3)',
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: desktop && desktopKind === 'dialog' ? 'flex' : 'block',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'var(--scrim)', cursor: 'default' }}
      />
      <div ref={panel} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className="sheet-scroll" style={{ ...panelStyle, outline: 'none' }}>
        {!desktop && <div className="grab" />}
        {children}
      </div>
    </div>
  )
}
