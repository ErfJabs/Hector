import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ActivityFeed, session } from '../../api'
import { useAsync, useIsDesktop, useOnChanged } from '../../hooks'
import { ago } from '../../format'
import { SectionNav } from '../../components/section'
import { ErrorPanel } from '../../components/states'
import { TopBar } from '../../components/topbar'
import { pad2, StatusTag } from '../../components/resource'
import type { ActionInfo } from '../../types'

export default function ActivityScreen() {
  const desktop = useIsDesktop()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  const feed = useAsync(() => ActivityFeed.get(), [], {
    pollMs: 15000,
    cache: { key: 'activity', ttlMs: 15000 },
  })
  useOnChanged(() => feed.reload(true))
  const refresh = () => feed.reload(true)

  const signOut = () => {
    session.clear()
    navigate('/signin', { replace: true })
  }

  const q = query.trim().toLowerCase()
  const running = (feed.data?.running ?? []).filter((a) => !q || a.command.includes(q))
  const done = (feed.data?.actions ?? [])
    .filter((a) => a.status !== 'running')
    .filter((a) => !q || a.command.includes(q))
  const total = running.length + done.length

  return (
    <div className={desktop ? 'page page--d' : 'page'}>
      <TopBar onRefresh={refresh} onSignOut={signOut} />
      <SectionNav />

      <section style={{ padding: desktop ? '26px 40px 0' : '14px 16px 0' }}>
        <div className="head" style={{ marginBottom: 20 }}>
          <h1 className="d" style={{ fontSize: desktop ? 56 : 46 }}>
            Activity
          </h1>
          <span className={total ? 'd red' : 'd t3'} style={{ fontSize: desktop ? 56 : 46 }}>
            {pad2(total)}
          </span>
        </div>
        <label className="field" style={{ height: desktop ? 44 : 48 }}>
          <input
            type="search"
            placeholder="Filter by command"
            aria-label="Filter actions"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ fontSize: desktop ? 14 : 16 }}
          />
        </label>
      </section>

      <section style={{ padding: desktop ? '18px 40px 60px' : '16px 16px 60px' }}>
        {feed.loading && !feed.data ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skel" style={{ height: 58 }} />
            ))}
          </div>
        ) : feed.error && !feed.data ? (
          <ErrorPanel error={feed.error} onRetry={refresh} />
        ) : total === 0 ? (
          <div style={{ padding: desktop ? '40px 0' : '24px 0' }}>
            <p style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2, margin: 0 }}>
              {q ? 'Nothing matches.' : 'No actions yet.'}
            </p>
            <p className="t2" style={{ fontSize: 14, lineHeight: 1.5, margin: '10px 0 0' }}>
              Power, rescale, snapshots, firewall changes — everything Hetzner runs shows up here as soon as it starts.
            </p>
          </div>
        ) : (
          <>
            {running.length > 0 && (
              <div className="eb" style={{ marginBottom: 10 }}>
                Running · {pad2(running.length)}
              </div>
            )}
            {running.map((a) => (
              <Row key={a.id} action={a} />
            ))}
            {done.length > 0 && (
              <div className="eb" style={{ margin: running.length ? '26px 0 10px' : '0 0 10px' }}>
                Finished · {pad2(done.length)}
              </div>
            )}
            {done.map((a) => (
              <Row key={a.id} action={a} />
            ))}
          </>
        )}

        {feed.error && feed.data && (
          <div style={{ marginTop: 16 }}>
            <ErrorPanel error={feed.error} onRetry={refresh} />
          </div>
        )}
      </section>
    </div>
  )
}

function Row({ action }: { action: ActionInfo }) {
  const running = action.status === 'running'
  const shape =
    action.status === 'success' ? 'sq sq-run' : action.status === 'error' ? 'sq sq-err' : running ? 'sq sq-move' : 'sq sq-unk'

  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--line-row)' }}>
      <span className={shape} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="m" style={{ fontSize: 13, fontWeight: 500 }}>
            {action.command}
          </span>
          <StatusTag status={action.status} />
          <span className="num t3" style={{ fontSize: 11 }}>
            #{action.id}
          </span>
        </div>
        {running && (
          <div style={{ height: 4, background: 'var(--line)', marginTop: 10, maxWidth: 420 }}>
            <div className="hatch" style={{ width: `${action.progress}%`, height: 4 }} />
          </div>
        )}
        {action.status === 'error' && action.errorMessage && (
          <div className="m" style={{ fontSize: 11, color: 'var(--accent-soft)', marginTop: 6 }}>
            {[action.errorCode, action.errorMessage].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
      <div style={{ textAlign: 'right', flex: 'none' }}>
        <div className="num t2" style={{ fontSize: 13 }}>
          {running ? `${action.progress}%` : `${action.durationS} s`}
        </div>
        <div className="t3" style={{ fontSize: 11, marginTop: 4 }}>
          {ago(action.started)}
        </div>
      </div>
    </div>
  )
}
