import type { ApiError } from '../api'
import { Ic } from '../icons'

/** Loading skeleton — the A column of the states board. */
export function SkeletonFleet({ desktop }: { desktop: boolean }) {
  if (desktop) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
          <span className="skel" style={{ width: 420, height: 96 }} />
          <span className="skel" style={{ width: 80, height: 48 }} />
        </div>
        <div className="grid1" style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', marginBottom: 22 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ padding: '16px 18px', height: 76 }}>
              <span className="skel" style={{ display: 'block', width: 70, height: 10 }} />
              <span className="skel" style={{ display: 'block', width: 90, height: 22, marginTop: 12 }} />
            </div>
          ))}
        </div>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, height: 66, borderBottom: '1px solid var(--line-row)' }}>
            <span className="skel" style={{ width: 10, height: 10 }} />
            <span className="skel" style={{ width: 150, height: 14 }} />
            <span className="skel" style={{ width: 90, height: 12 }} />
            <span className="skel" style={{ width: 90, height: 12 }} />
            <span className="skel" style={{ flex: 1, height: 12 }} />
          </div>
        ))}
      </div>
    )
  }
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h1 className="d" style={{ margin: 0, fontSize: 46 }}>
          Servers
        </h1>
        <span className="skel" style={{ width: 60, height: 40 }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 28 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card" style={{ padding: 14, height: 176 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className="skel" style={{ width: 10, height: 10 }} />
              <span className="skel" style={{ width: 140, height: 14 }} />
            </div>
            <span className="skel" style={{ display: 'block', width: 200, height: 10, margin: '10px 0 0 20px' }} />
            <div className="grid1" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', marginTop: 16 }}>
              <div style={{ height: 76, background: 'var(--card)' }} />
              <div style={{ height: 76, background: 'var(--card)' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** B column — no servers yet. */
export function EmptyFleet({ onNew }: { onNew: () => void }) {
  return (
    <div style={{ padding: '14px 16px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h1 className="d" style={{ margin: 0, fontSize: 46 }}>
          Servers
        </h1>
        <span className="d t3" style={{ fontSize: 46 }}>
          00
        </span>
      </div>
      <p style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2, margin: '80px 0 0' }}>
        This project has no servers yet.
      </p>
      <p className="t2" style={{ fontSize: 14, lineHeight: 1.5, margin: '10px 0 0' }}>
        Pick a location, an image and a type. It takes about a minute.
      </p>
      <button type="button" className="btn btn-red" style={{ width: '100%', height: 54, marginTop: 26, fontSize: 13 }} onClick={onNew}>
        <Ic.Plus />
        New server
      </button>
    </div>
  )
}

/** C column — what went wrong talking to Hetzner. One card, chosen by code. */
export function ErrorPanel({
  error,
  onRetry,
  lastFetchedAt,
}: {
  error: ApiError
  onRetry: () => void
  lastFetchedAt?: Date | null
}) {
  // A 401 with code "session" is our own sign-in expiring (App redirects);
  // only Hetzner's rejection of HCLOUD_TOKEN gets the token card.
  const tokenProblem =
    error.code === 'unauthorized' || error.code === 'token_missing' || (error.status === 401 && error.code !== 'session')
  const proxyProblem = error.code === 'proxy'

  if (error.status === 404) {
    return (
      <div style={{ border: '1px solid var(--line3)', padding: 16 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="sq sq-unk" />
          <span className="m t3" style={{ fontSize: 11, letterSpacing: '.14em' }}>
            404 · NOT FOUND
          </span>
        </div>
        <p style={{ fontSize: 18, fontWeight: 600, margin: '12px 0 0', lineHeight: 1.3 }}>This server doesn't exist anymore.</p>
        <p className="t2" style={{ fontSize: 13.5, lineHeight: 1.5, margin: '8px 0 0' }}>
          It was deleted, or the link points to another project.
        </p>
      </div>
    )
  }

  if (tokenProblem) {
    return (
      <div style={{ border: '1px solid var(--accent)', padding: 16 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="sq sq-err" />
          <span className="m" style={{ fontSize: 11, letterSpacing: '.14em', color: 'var(--accent-soft)' }}>
            401 · UNAUTHORIZED
          </span>
        </div>
        <p style={{ fontSize: 18, fontWeight: 600, margin: '12px 0 0', lineHeight: 1.3 }}>Hetzner rejected the API token.</p>
        <p className="t2" style={{ fontSize: 13.5, lineHeight: 1.5, margin: '8px 0 0' }}>
          Update <span className="m" style={{ color: 'var(--fg)' }}>HCLOUD_TOKEN</span> in the server's environment and
          restart the panel. Read + write access is required.
        </p>
        <button type="button" className="btn" style={{ width: '100%', marginTop: 16 }} onClick={onRetry}>
          <Ic.Refresh />
          Retry
        </button>
      </div>
    )
  }

  if (proxyProblem) {
    return (
      <div style={{ border: '1px solid var(--warn-line)', padding: 16 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="sq sq-warn" />
          <span className="m" style={{ fontSize: 11, letterSpacing: '.14em', color: 'var(--warn)' }}>
            PROXY · NO ROUTE
          </span>
        </div>
        <p style={{ fontSize: 18, fontWeight: 600, margin: '12px 0 0', lineHeight: 1.3 }}>The proxy didn't get through.</p>
        <p className="t2" style={{ fontSize: 13.5, lineHeight: 1.5, margin: '8px 0 0' }}>
          Requests to api.hetzner.cloud go through the proxy set in <span className="m" style={{ color: 'var(--fg)' }}>PROXY_URL</span>.
          {lastFetchedAt ? ` Showing the last data from ${lastFetchedAt.toTimeString().slice(0, 5)}.` : ''}
        </p>
        <button type="button" className="btn" style={{ width: '100%', marginTop: 16 }} onClick={onRetry}>
          <Ic.Refresh />
          Retry
        </button>
      </div>
    )
  }

  return (
    <div style={{ border: '1px solid var(--accent-line)', padding: 16 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span className="sq sq-err" />
        <span className="m" style={{ fontSize: 11, letterSpacing: '.14em', color: 'var(--accent-soft)' }}>
          HETZNER · {error.status || 'ERROR'}
        </span>
      </div>
      <p style={{ fontSize: 18, fontWeight: 600, margin: '12px 0 0', lineHeight: 1.3 }}>Can't reach Hetzner.</p>
      <p className="t2" style={{ fontSize: 13.5, lineHeight: 1.5, margin: '8px 0 0' }}>
        {error.message}
      </p>
      <button type="button" className="btn" style={{ width: '100%', marginTop: 16 }} onClick={onRetry}>
        <Ic.Refresh />
        Retry
      </button>
    </div>
  )
}
