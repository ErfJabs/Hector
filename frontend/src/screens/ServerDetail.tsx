import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { API, cache } from '../api'
import { useAsync, useIsDesktop, useOnChanged } from '../hooks'
import { Ic } from '../icons'
import { ErrorPanel, SkeletonFleet } from '../components/states'
import { age, euro, statusShape, uptime } from '../format'
import type { Fleet, MetricsView, ServerDetail as Detail } from '../types'
import Servers from './Servers'
import Overview from './tabs/Overview'
import Metrics from './tabs/Metrics'
import Network from './tabs/Network'
import Manage from './tabs/Manage'
import PowerSheet from './PowerSheet'
import DeleteSheet from './DeleteSheet'

const TABS = ['overview', 'metrics', 'network', 'manage'] as const
type Tab = (typeof TABS)[number]

export default function ServerDetail() {
  const params = useParams()
  const serverId = Number(params.id)
  const tab = (TABS.includes(params.tab as Tab) ? params.tab : 'overview') as Tab
  const navigate = useNavigate()
  const desktop = useIsDesktop()

  const [overlay, setOverlay] = useState<null | 'power' | 'delete'>(null)

  // The fleet list already carries this server — seed the sheet from it so
  // a click paints instantly and costs no extra request. While open, the
  // single poll is the metrics call: the charts plus the detail extras
  // (rDNS, actions, on-since, a fresh base item) ride in it.
  const seed = useMemo(() => cache.peek<Fleet>('fleet')?.servers.find((s) => s.id === serverId) ?? null, [serverId])
  const range = desktop ? '24H' : '1H'
  const st = useAsync<Detail>(() => API.server(serverId), [serverId], {
    // direct opens (no list data in memory) still fetch the detail once
    skip: !!seed,
    pollMs: 8000,
    cache: { key: `server:${serverId}`, ttlMs: 5000 },
  })
  const metrics = useAsync<MetricsView>(() => API.metrics(serverId, range), [serverId, range], {
    pollMs: 20000,
    cache: { key: `metrics:${serverId}:${range}`, ttlMs: 20000 },
  })
  const reload = () => {
    if (!seed) st.reload(true)
    metrics.reload(true)
  }
  useOnChanged(reload)

  const fetched = st.data && st.data.id === serverId ? st.data : null
  const base: Detail | null =
    fetched ?? (seed ? { ...seed, datacenter: '', onSince: null, rdns: [], actions: [], actionsTotal: 0 } : null)
  const x = metrics.data?.extras ?? null
  // extras refresh the base but never clobber its cpu (the list's sparkline)
  const detail: Detail | null = base && x
    ? { ...base, ...x.item, cpu: base.cpu, rdns: x.rdns ?? [], actions: x.actions ?? [], actionsTotal: x.actionsTotal ?? 0, onSince: x.onSince ?? base.onSince }
    : base

  const close = () => navigate('/')

  // Desktop sheet: Escape closes it (open Power/Delete/Manage dialogs catch
  // Escape first in the capture phase, so only the top layer closes).
  useEffect(() => {
    if (!desktop) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') navigate('/')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [desktop, navigate])

  if (!detail) {
    return (
      <div className={desktop ? 'page page--d' : 'page'}>
        <div style={{ padding: desktop ? '20px 28px 0' : '12px 8px 0' }}>
          <button type="button" className="btn btn-ico btn-bare" aria-label="Back to servers" onClick={close}>
            <Ic.Back />
          </button>
        </div>
        <div style={{ padding: desktop ? '14px 40px 0' : '8px 16px 0' }}>
          {st.error ? <ErrorPanel error={st.error} onRetry={reload} /> : <SkeletonFleet desktop={desktop} />}
        </div>
      </div>
    )
  }

  const shape = statusShape(detail.status)
  const meta = `${detail.type.name.toUpperCase()} · ${detail.location.code}${detail.datacenter ? ` ${detail.datacenter.split('-')[1] ?? ''}` : ''} · ${detail.image.toUpperCase()} · ${detail.priceUnknown ? 'PRICE UNKNOWN' : `${euro(detail.price)}/MO`}`
  // "ON FOR" needs a start/reboot action in the recent history; the age
  // (created) is always known.
  const clock = [
    detail.status === 'running' && detail.onSince ? `ON FOR ${uptime(detail.onSince)}` : '',
    `AGE ${age(detail.created)}`,
  ]
    .filter(Boolean)
    .join(' · ')

  const tabContent = (
    <>
      {tab === 'overview' && <Overview detail={detail} desktop={desktop} onPower={() => setOverlay('power')} m={metrics.data} />}
      {tab === 'metrics' && <Metrics serverId={serverId} detail={detail} desktop={desktop} />}
      {tab === 'network' && <Network detail={detail} desktop={desktop} onChanged={reload} />}
      {tab === 'manage' && (
        <Manage
          detail={detail}
          onChanged={reload}
          onRescale={() => navigate(`/servers/${serverId}/rescale`)}
          onDelete={() => setOverlay('delete')}
        />
      )}
    </>
  )

  if (desktop) {
    // Desktop: the list stays behind a scrim and the detail lives in a
    // right-hand sheet (board: D · Server sheet).
    return (
      <div className="page page--d" style={{ minHeight: '100vh' }}>
        {/* inert: the list behind the scrim can't be tabbed into or clicked */}
        <div aria-hidden="true" inert>
          <Servers />
        </div>
        <div style={{ position: 'fixed', inset: 0, background: 'var(--scrim2)', zIndex: 30 }} onClick={close} />
        <aside
          role="dialog"
          aria-label={detail.name}
          className="sheet-scroll"
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: 700,
            background: 'var(--panel)',
            borderLeft: '1px solid var(--line3)',
            zIndex: 40,
            overflowY: 'auto',
          }}
        >
          <div style={{ padding: '20px 28px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className={shape.sq} style={{ width: 12, height: 12 }} />
                <span className="m" style={{ color: shape.running ? 'var(--run)' : shape.busy ? 'var(--move)' : 'var(--t3)', fontSize: 11, letterSpacing: '.14em' }}>
                  {shape.label.toUpperCase()}
                </span>
                <span className="m t3" style={{ fontSize: 11 }}>
                  · {clock} · #{detail.id}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="btn btn-line" onClick={() => setOverlay('power')}>
                  <Ic.Power />
                  Power
                </button>
                <button type="button" className="btn btn-ico btn-line" aria-label="Close" onClick={close}>
                  <Ic.X />
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 8 }}>
              <div>
                <h1 style={{ margin: 0, fontSize: 38, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1 }}>{detail.name}</h1>
                <div className="m t3" style={{ fontSize: 11.5, letterSpacing: '.06em', marginTop: 10 }}>
                  {meta}
                </div>
              </div>
            </div>
          </div>
          <nav aria-label="Server sections" style={{ display: 'flex', gap: 28, padding: '0 28px', marginTop: 14, borderBottom: '1px solid var(--line)' }}>
            {TABS.map((t) => (
              <button key={t} type="button" aria-current={t === tab ? 'page' : undefined} className={t === tab ? 'tab tab-on' : 'tab'} onClick={() => navigate(`/servers/${serverId}/${t}`, { replace: true })}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </nav>
          <div style={{ paddingBottom: 40 }}>{tabContent}</div>
        </aside>

        <PowerSheet
          open={overlay === 'power'}
          onClose={() => setOverlay(null)}
          detail={detail}
          desktop
          onSent={reload}
        />
        <DeleteSheet
          open={overlay === 'delete'}
          onClose={() => setOverlay(null)}
          detail={detail}
          desktop
          onDeleted={() => navigate('/')}
        />
      </div>
    )
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 8px 0' }}>
        <button type="button" className="btn btn-ico btn-bare" aria-label="Close" onClick={close}>
          <Ic.X />
        </button>
        <span className="m t3" style={{ fontSize: 10.5, letterSpacing: '.1em' }}>#{detail.id}</span>
        <button type="button" className="btn btn-ico btn-line" aria-label="Power" onClick={() => setOverlay('power')}>
          <Ic.Power />
        </button>
      </div>
      <div style={{ padding: '6px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className={shape.sq} style={{ width: 12, height: 12 }} />
          <span className="m" style={{ color: shape.running ? 'var(--run)' : shape.busy ? 'var(--move)' : 'var(--t3)', fontSize: 11, letterSpacing: '.14em' }}>
            {shape.label.toUpperCase()}
          </span>
          <span className="m t3" style={{ fontSize: 11, letterSpacing: '.06em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            · {clock}
          </span>
        </div>
        <h1 style={{ margin: '10px 0 0', fontSize: 30, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.05 }}>{detail.name}</h1>
        <div className="m t3" style={{ fontSize: 11.5, letterSpacing: '.06em', marginTop: 8 }}>
          {meta}
        </div>
      </div>
      <nav aria-label="Server sections" className="hscroll" style={{ display: 'flex', gap: 22, padding: '0 16px', marginTop: 10, borderBottom: '1px solid var(--line)' }}>
        {TABS.map((t) => (
          <button key={t} type="button" aria-current={t === tab ? 'page' : undefined} className={t === tab ? 'tab tab-on' : 'tab'} onClick={() => navigate(`/servers/${serverId}/${t}`, { replace: true })}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>
      <div style={{ paddingBottom: 48 }}>{tabContent}</div>

      <PowerSheet open={overlay === 'power'} onClose={() => setOverlay(null)} detail={detail} onSent={reload} />
      <DeleteSheet open={overlay === 'delete'} onClose={() => setOverlay(null)} detail={detail} onDeleted={() => navigate('/')} />
    </div>
  )
}
