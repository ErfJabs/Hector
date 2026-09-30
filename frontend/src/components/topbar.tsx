import { Ic } from '../icons'
import { ThemeToggle } from './theme-toggle'
import { useIsDesktop } from '../hooks'

/** The HECTOR mark: a 22/24px signal-red square with a cut corner. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, background: 'var(--accent)', position: 'relative', display: 'inline-block', flex: 'none' }}
    >
      <span style={{ position: 'absolute', right: 4, top: 4, width: 7, height: 7, background: 'var(--bg)' }} />
    </span>
  )
}

export function TopBar({
  onRefresh,
  onSignOut,
  showRefresh = true,
}: {
  onRefresh?: () => void
  onSignOut: () => void
  showRefresh?: boolean
}) {
  const desktop = useIsDesktop()
  const height = desktop ? 64 : 52
  const padding = desktop ? '0 28px 0 40px' : '0 8px 0 16px'

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height, padding }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: desktop ? 12 : 10 }}>
        <Logo size={desktop ? 24 : 22} />
        <span
          className="m"
          style={{ fontSize: desktop ? 12 : 11, letterSpacing: desktop ? '.22em' : '.2em', color: 'var(--t2)' }}
        >
          HECTOR
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: desktop ? 4 : 0 }}>
        <a
          className="btn btn-ico btn-bare"
          href="https://t.me/erfjabs"
          target="_blank"
          rel="noreferrer"
          aria-label="Telegram channel"
          title="Telegram · @erfjabs"
        >
          <Ic.Telegram />
        </a>
        <ThemeToggle />
        {showRefresh && (
          <button className="btn btn-ico btn-bare" aria-label="Refresh" onClick={onRefresh} type="button">
            <Ic.Refresh />
          </button>
        )}
        {/* One tap signs out, so it must look like sign-out (a ⋯ "account"
            button that silently logged you out was the old behavior). */}
        <button className="btn btn-ico btn-bare" aria-label="Sign out" title="Sign out" onClick={onSignOut} type="button">
          <Ic.SignOut />
        </button>
      </div>
    </div>
  )
}
