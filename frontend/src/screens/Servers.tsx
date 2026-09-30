import { useEffect, useMemo, useRef, useState } from 'react'

/** Fleet CPU sparkline: 12 samples, one per 5 min (backend step 300 s). */
const FLEET_STEP_S = 300
import { Link, useNavigate } from 'react-router-dom'
import { API, session, takeFleetDirty } from '../api'
import { useAsync, useIsDesktop, useOnChanged } from '../hooks'
import { Ic } from '../icons'
import { TopBar } from '../components/topbar'
import { agoLabel, Blocks, Meter } from '../components/charts'
import { EmptyFleet, ErrorPanel, SkeletonFleet } from '../components/states'
import { euro, flags, maskIp, metaLine, pct, specLine, statusShape, tb } from '../format'
import type { Fleet, FleetItem } from '../types'

type Filter = 'all' | 'running' | 'busy' | 'off'

function matches(item: FleetItem, filter: Filter): boolean {
  const shape = statusShape(item.status)
  if (filter === 'all') return true
  if (filter === 'busy') return shape.busy || !!item.busy
  return item.status === filter
}

/** Table columns: flexible so 1100–1280px windows don't scroll sideways
 *  (the old fixed widths summed to ~1.2k px). */
const DESKTOP_COLS =
  'minmax(200px, 1.6fr) minmax(130px, 1fr) minmax(110px, .8fr) minmax(130px, 1fr) minmax(150px, 1.3fr) minmax(140px, 1fr) 80px 32px'

/** Servers ordered before Hetzner's 15 Jun 2026 price change keep their old
 *  price. The backend fills it from Hetzner's published old-price table;
 *  only a type missing from that table stays "unknown". */
function priceTitle(item: FleetItem): string {
  if (item.priceUnknown) return 'Ordered before 15 Jun 2026 — its old price is not in the price table'
  return item.legacyPrice
    ? `Old price (ordered before 15 Jun 2026), ${euro(item.price)}/mo incl. VAT, excl. IPv4`
    : `${euro(item.price)}/mo incl. VAT, excl. IPv4 — as in the Hetzner console`
}

function LegacyNote({ n }: { n: number }) {
  return (
    <span className="m t3" style={{ display: 'block', fontSize: 10, letterSpacing: '.06em', marginTop: 4 }}>
      + {n} PRICE UNKNOWN
    </span>
  )
}

/** "07" — the display count next to the title. */
const pad2 = (n: number) => String(n).padStart(2, '0')

export default function Servers() {
  const navigate = useNavigate()
  const desktop = useIsDesktop()

  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  // Only an explicit refresh/retry bypasses the backend's 25 s cache. The
  // background poll must not: a fresh fleet costs 1 + N Hetzner requests.
  const freshNext = useRef(false)
  const fleet = useAsync<Fleet>(
    () => {
      // explicit refresh, or a server changed since the last read
      const fresh = freshNext.current || takeFleetDirty()
      freshNext.current = false
      return API.fleet(fresh)
    },
    [],
    { pollMs: 15000, cache: { key: 'fleet', ttlMs: 15000 } },
  )
  // an action anywhere (power, rename, delete…) → re-read the list
  useOnChanged(() => fleet.reload(true))
  const refresh = () => {
    freshNext.current = true
    fleet.reload(true)
  }

  // "/" focuses search (desktop shows the key hint).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement | null)?.isContentEditable) return
      if (!searchRef.current) return
      e.preventDefault()
      searchRef.current.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const servers = fleet.data?.servers ?? []
  const summary = fleet.data?.summary

  const visible = useMemo(() => {
    const list = servers
      .filter((s) => matches(s, filter))
      .filter((s) => {
        if (!query.trim()) return true
        const q = query.trim().toLowerCase()
        return s.name.toLowerCase().includes(q) || s.ipv4.includes(q) || s.ipv6.toLowerCase().includes(q)
      })
    // newest servers first (no sort control; this is the one fixed order)
    return [...list].sort((a, b) => Date.parse(b.created) - Date.parse(a.created) || b.id - a.id)
  }, [servers, filter, query])

  const counts = useMemo(() => {
    const c = { all: servers.length, running: 0, busy: 0, off: 0 }
    for (const s of servers) {
      if (s.status === 'running') c.running++
      if (statusShape(s.status).busy || s.busy) c.busy++
      if (s.status === 'off') c.off++
    }
    return c
  }, [servers])

  const signOut = () => {
    session.clear()
    navigate('/signin', { replace: true })
  }

  const content = (
    <>
      {fleet.loading && !fleet.data ? (
        <section style={{ padding: desktop ? '26px 40px 0' : '14px 16px 0' }}>
          <SkeletonFleet desktop={desktop} />
        </section>
      ) : fleet.error && !fleet.data ? (
        <section style={{ padding: desktop ? '26px 40px 0' : '14px 16px 0' }}>
          <ErrorPanel error={fleet.error} onRetry={refresh} />
        </section>
      ) : servers.length === 0 ? (
        <EmptyFleet onNew={() => navigate('/new')} />
      ) : desktop ? (
        <DesktopFleet
          servers={visible}
          total={servers.length}
          summary={summary}
          filter={filter}
          setFilter={setFilter}
          counts={counts}
          query={query}
          setQuery={setQuery}
          onNew={() => navigate('/new')}
          searchRef={searchRef}
        />
      ) : (
        <MobileFleet
          servers={visible}
          total={servers.length}
          summary={summary}
          filter={filter}
          setFilter={setFilter}
          counts={counts}
          query={query}
          setQuery={setQuery}
          onNew={() => navigate('/new')}
          searchRef={searchRef}
        />
      )}

      {fleet.error && fleet.data && (
        <section style={{ padding: desktop ? '0 40px 24px' : '14px 16px 0' }}>
          <ErrorPanel
            error={fleet.error}
            onRetry={refresh}
            lastFetchedAt={new Date(fleet.data.fetchedAt)}
          />
        </section>
      )}
    </>
  )

  return (
    <div className={desktop ? 'page page--d' : 'page'}>
      <TopBar onRefresh={refresh} onSignOut={signOut} />
      {content}
    </div>
  )
}

// ---- mobile ------------------------------------------------------------

interface ViewProps {
  servers: FleetItem[]
  total: number
  summary?: Fleet['summary']
  filter: Filter
  setFilter: (f: Filter) => void
  counts: { all: number; running: number; busy: number; off: number }
  query: string
  setQuery: (q: string) => void
  onNew: () => void
  searchRef: React.RefObject<HTMLInputElement | null>
}

function MobileFleet({
  servers,
  total,
  summary,
  filter,
  setFilter,
  counts,
  query,
  setQuery,
  onNew,
  searchRef,
}: ViewProps) {
  return (
    <>
      <section style={{ padding: '14px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <h1 className="d" style={{ margin: 0, fontSize: 46 }}>
            Servers
          </h1>
          <span className="d" style={{ fontSize: 46, color: 'var(--accent)' }}>
            {pad2(total)}
          </span>
        </div>

        <div className="grid1" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', marginTop: 20 }}>
          <div style={{ padding: 14 }}>
            <div className="eb">vCPU</div>
            <div className="num" style={{ fontSize: 28, marginTop: 8 }}>
              {summary?.vcpu ?? '—'}
            </div>
          </div>
          <div style={{ padding: 14 }}>
            <div className="eb">Memory</div>
            <div className="num" style={{ fontSize: 28, marginTop: 8 }}>
              {summary ? Math.round(summary.memoryGb) : '—'}
              <span className="t3" style={{ fontSize: 14 }}> GB</span>
            </div>
          </div>
          <div style={{ padding: 14 }}>
            <div className="eb">Out traffic</div>
            <div className="num" style={{ fontSize: 28, marginTop: 8 }}>
              {summary ? tb(summary.outBytes) : '—'}
              <span className="t3" style={{ fontSize: 14 }}> TB</span>
            </div>
          </div>
          <div style={{ padding: 14 }}>
            <div className="eb">Est. / month</div>
            <div className="num" style={{ fontSize: 28, marginTop: 8 }}>
              {summary ? euro(summary.monthly) : '—'}
              {summary && summary.legacy > 0 && <LegacyNote n={summary.legacy} />}
            </div>
          </div>
        </div>
      </section>

      <section style={{ padding: '24px 16px 0' }}>
        {/* search + New server on one row (the bottom dock is gone) */}
        <div style={{ display: 'flex', gap: 8 }}>
          <label className="field" style={{ gap: 10, flex: 1, minWidth: 0 }}>
            <span className="t3">
              <Ic.Search />
            </span>
            <input
              ref={searchRef}
              type="search"
              placeholder="Name or IP"
              aria-label="Search servers"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <button type="button" className="btn btn-red" style={{ height: 48, padding: '0 14px', flex: 'none' }} onClick={onNew}>
            <Ic.Plus />
            New
          </button>
        </div>
        {/* the chips can be wider than a small phone: scroll, never clip */}
        <div className="hscroll" style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <Chips filter={filter} setFilter={setFilter} counts={counts} />
        </div>
      </section>

      <section style={{ padding: '14px 16px 40px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {servers.map((s) => (
          <FleetCard key={s.id} item={s} />
        ))}
        {servers.length === 0 && (
          <p className="t3 m" style={{ fontSize: 12, padding: '20px 0', textAlign: 'center' }}>
            No servers match.
          </p>
        )}
      </section>
    </>
  )
}

function Chips({ filter, setFilter, counts }: { filter: Filter; setFilter: (f: Filter) => void; counts: ViewProps['counts'] }) {
  const defs: [Filter, string, number][] = [
    ['all', 'All', counts.all],
    ['running', 'Running', counts.running],
    ['busy', 'Busy', counts.busy],
    ['off', 'Off', counts.off],
  ]
  return (
    <>
      {defs.map(([key, label, n]) => (
        <button
          key={key}
          type="button"
          className={filter === key ? 'chip chip-on' : 'chip'}
          aria-pressed={filter === key}
          onClick={() => setFilter(key)}
        >
          {label} <b>{n}</b>
        </button>
      ))}
    </>
  )
}

function FleetCard({ item }: { item: FleetItem }) {
  // tap a column to read it; tap the card elsewhere to open the server
  const [picked, setPicked] = useState<number | null>(null)
  const shape = statusShape(item.status)
  const tags = flags(item)
  const frac = item.traffic.includedBytes > 0 ? item.traffic.outBytes / item.traffic.includedBytes : 0
  const aria = `${item.name}, ${shape.label}${shape.running && item.cpu ? `, CPU ${Math.round(item.cpu.now)}%` : ''}`

  return (
    <Link
      to={`/servers/${item.id}`}
      className="card"
      style={{ display: 'block', padding: '14px 14px 12px', opacity: shape.off ? 0.62 : 1, userSelect: 'none', WebkitUserSelect: 'none' }}
      aria-label={aria}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className={shape.sq} />
        <span
          style={{
            fontSize: 16,
            fontWeight: 600,
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            letterSpacing: '-0.01em',
          }}
        >
          {item.name}
        </span>
        <span className="m" style={{ color: shape.busy ? 'var(--move)' : shape.running ? 'var(--run)' : 'var(--t3)', fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase' }}>
          {shape.label}
        </span>
      </div>
      <div className="m t3" style={{ fontSize: 11, letterSpacing: '.06em', margin: '6px 0 0 20px' }}>
        {metaLine(item)}
      </div>
      {tags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, margin: '10px 0 0 20px', flexWrap: 'wrap' }}>
          {tags.map((t) => (
            <span key={t.label} className={t.cls}>
              {t.label}
            </span>
          ))}
        </div>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gap: 1,
          background: 'var(--line)',
          border: '1px solid var(--line)',
          marginTop: 12,
        }}
      >
        <div style={{ background: 'var(--card)', padding: '10px 10px 11px', minHeight: 76 }}>
          {shape.running && item.cpu ? (
            <>
              <div className="eb" style={{ fontSize: 9.5, color: picked !== null ? 'var(--fg)' : undefined }}>
                {picked !== null ? `CPU · ${agoLabel(picked, item.cpu.series.slice(-12).length, FLEET_STEP_S)}` : 'CPU · 60 min'}
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 9 }}>
                <Blocks series={item.cpu.series.slice(-12)} picked={picked} onPick={(i) => setPicked(i === picked ? null : i)} />
                <span
                  className="num"
                  style={{ color: (picked !== null ? item.cpu.series.slice(-12)[picked] : item.cpu.now) >= 85 ? 'var(--accent)' : 'var(--fg)', fontSize: 22, fontWeight: 500, lineHeight: 1 }}
                >
                  {pct(picked !== null ? item.cpu.series.slice(-12)[picked] : item.cpu.now)}
                </span>
              </div>
            </>
          ) : item.busy || shape.busy ? (
            <>
              <div className="eb" style={{ fontSize: 9.5, color: 'var(--move)' }}>
                {item.busy?.command ?? shape.label}
              </div>
              <div className="num" style={{ fontSize: 22, fontWeight: 500, lineHeight: 1, marginTop: 9 }}>
                {item.busy ? `${item.busy.progress}%` : '…'}
              </div>
              <div style={{ height: 6, background: 'var(--line)', marginTop: 8 }}>
                <div className="hatch" style={{ width: `${item.busy?.progress ?? 100}%`, height: 6 }} />
              </div>
            </>
          ) : shape.running ? (
            <>
              <div className="eb" style={{ fontSize: 9.5 }}>CPU</div>
              <div className="m t3" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.35 }}>
                No metrics yet.
              </div>
            </>
          ) : (
            <>
              <div className="eb" style={{ fontSize: 9.5 }}>CPU</div>
              <div className="m t3" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.35 }}>
                Powered off.
                <br />
                No metrics.
              </div>
            </>
          )}
        </div>
        <div style={{ background: 'var(--card)', padding: '10px 10px 11px' }}>
          <div className="eb" style={{ fontSize: 9.5 }}>Out traffic</div>
          <div className="num" style={{ fontSize: 15, marginTop: 9 }}>
            <span style={frac >= 0.8 ? { color: 'var(--warn)' } : undefined}>{tb(item.traffic.outBytes)}</span>
            <span className="t3"> / {tb(item.traffic.includedBytes)} TB</span>
          </div>
          <div style={{ marginTop: 9 }}>
            <Meter fraction={frac} />
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 11 }}>
        <span className="m" style={{ fontSize: 13, letterSpacing: '.02em', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {maskIp(item.ipv4 || item.ipv6) || 'No public IP'}
        </span>
        <span className="m t3" style={{ fontSize: 11.5, flex: 'none' }} title={priceTitle(item)}>
          {item.priceUnknown ? 'PRICE UNKNOWN' : `${euro(item.price)}/mo`}
        </span>
      </div>
    </Link>
  )
}

// ---- desktop -----------------------------------------------------------

function DesktopFleet({
  servers,
  total,
  summary,
  filter,
  setFilter,
  counts,
  query,
  setQuery,
  onNew,
  searchRef,
}: ViewProps) {
  return (
    <>
      <section style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '26px 40px 0', gap: 40 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18 }}>
          <h1 className="d" style={{ margin: 0, fontSize: 104 }}>
            Servers
          </h1>
          <span className="d" style={{ fontSize: 40, color: 'var(--accent)', marginTop: 4 }}>
            {pad2(total)}
          </span>
        </div>
      </section>

      <section style={{ padding: '26px 40px 0' }}>
        <div className="grid1" style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}>
          <div style={{ padding: '16px 18px' }}>
            <div className="eb">Running</div>
            <div className="num" style={{ fontSize: 30, marginTop: 10 }}>
              {summary?.running ?? '—'}
              <span className="t3" style={{ fontSize: 16 }}> / {summary?.total ?? '—'}</span>
            </div>
          </div>
          <div style={{ padding: '16px 18px' }}>
            <div className="eb">vCPU</div>
            <div className="num" style={{ fontSize: 30, marginTop: 10 }}>{summary?.vcpu ?? '—'}</div>
          </div>
          <div style={{ padding: '16px 18px' }}>
            <div className="eb">Memory</div>
            <div className="num" style={{ fontSize: 30, marginTop: 10 }}>
              {summary ? Math.round(summary.memoryGb) : '—'}
              <span className="t3" style={{ fontSize: 16 }}> GB</span>
            </div>
          </div>
          <div style={{ padding: '16px 18px' }}>
            <div className="eb">Disk</div>
            <div className="num" style={{ fontSize: 30, marginTop: 10 }}>
              {summary?.diskGb ?? '—'}
              <span className="t3" style={{ fontSize: 16 }}> GB</span>
            </div>
          </div>
          <div style={{ padding: '16px 18px' }}>
            <div className="eb">Out traffic</div>
            <div className="num" style={{ fontSize: 30, marginTop: 10 }}>
              {summary ? tb(summary.outBytes) : '—'}
              <span className="t3" style={{ fontSize: 16 }}> TB</span>
            </div>
          </div>
          <div style={{ padding: '16px 18px' }}>
            <div className="eb">Est. / month</div>
            <div className="num" style={{ fontSize: 30, marginTop: 10 }}>
              {summary ? euro(summary.monthly) : '—'}
              {summary && summary.legacy > 0 && <LegacyNote n={summary.legacy} />}
            </div>
          </div>
        </div>
      </section>

      <section style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '22px 40px 0' }}>
        <label className="field" style={{ width: 380, height: 44 }}>
          <span className="t3">
            <Ic.Search />
          </span>
          <input
            ref={searchRef}
            type="search"
            placeholder="Name or IP"
            aria-label="Search servers"
            style={{ fontSize: 14 }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="m t3" style={{ fontSize: 10, border: '1px solid var(--line3)', padding: '2px 6px' }}>
            /
          </span>
        </label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {(['all', 'running', 'busy', 'off'] as Filter[]).map((key) => {
            const labels: Record<Filter, string> = { all: 'All', running: 'Running', busy: 'Busy', off: 'Off' }
            return (
              <button
                key={key}
                type="button"
                className={filter === key ? 'chip chip-on' : 'chip'}
                aria-pressed={filter === key}
                style={{ height: 44 }}
                onClick={() => setFilter(key)}
              >
                {labels[key]} <b>{counts[key]}</b>
              </button>
            )
          })}
        </div>
        <button type="button" className="btn btn-red" style={{ marginLeft: 'auto', height: 44, padding: '0 22px' }} onClick={onNew}>
          <Ic.Plus />
          New server
        </button>
      </section>

      <section style={{ padding: '16px 40px 40px' }}>
        <div
          className="eb"
          style={{
            display: 'grid',
            gridTemplateColumns: DESKTOP_COLS,
            padding: '0 0 10px',
            borderBottom: '1px solid var(--line3)',
            fontSize: 10,
          }}
        >
          <span style={{ paddingLeft: 22 }}>Server</span>
          <span>Type</span>
          <span>Location</span>
          <span>IPv4</span>
          <span>CPU · 60 min</span>
          <span>Out traffic</span>
          <span style={{ textAlign: 'right' }}>€ / mo</span>
          <span />
        </div>
        {servers.map((s) => (
          <DesktopRow key={s.id} item={s} />
        ))}
        {servers.length === 0 && (
          <p className="t3 m" style={{ fontSize: 12, padding: '20px 0' }}>
            No servers match.
          </p>
        )}
      </section>
    </>
  )
}

function DesktopRow({ item }: { item: FleetItem }) {
  const [picked, setPicked] = useState<number | null>(null)
  const shape = statusShape(item.status)
  const tags = flags(item)
  const frac = item.traffic.includedBytes > 0 ? item.traffic.outBytes / item.traffic.includedBytes : 0
  const hot = (item.cpu?.now ?? 0) >= 85
  const aria = `${item.name}, ${shape.label}${shape.running && item.cpu ? `, CPU ${Math.round(item.cpu.now)}%` : ''}`

  return (
    <Link
      to={`/servers/${item.id}`}
      aria-label={aria}
      style={{
        display: 'grid',
        gridTemplateColumns: DESKTOP_COLS,
        alignItems: 'center',
        height: 66,
        borderBottom: '1px solid var(--line-row)',
        opacity: shape.off ? 0.62 : 1,
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <span className={shape.sq} />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {item.name}
          </span>
          <span className="m" style={{ display: 'block', fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', marginTop: 3, color: shape.busy ? 'var(--move)' : shape.running ? 'var(--run)' : 'var(--t3)' }}>
            {shape.label}
          </span>
        </span>
        {tags.length > 0 && (
          <span style={{ display: 'flex', gap: 4 }}>
            {tags.slice(0, 2).map((t) => (
              <span key={t.label} className={t.cls} style={{ height: 20, fontSize: 9 }}>
                {t.label}
              </span>
            ))}
          </span>
        )}
      </span>
      <span>
        <span className="num" style={{ display: 'block', fontSize: 14 }}>{item.type.name.toUpperCase()}</span>
        <span className="m t3" style={{ display: 'block', fontSize: 10.5, marginTop: 3 }}>{specLine(item)}</span>
      </span>
      <span>
        <span className="num" style={{ display: 'block', fontSize: 14 }}>{item.location.code}</span>
        <span className="m t3" style={{ display: 'block', fontSize: 10.5, marginTop: 3 }}>{item.location.city}</span>
      </span>
      <span className="m" style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }}>
        {maskIp(item.ipv4 || item.ipv6) || '—'}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {shape.running && item.cpu ? (
          <>
            {/* hover (or click) a column: its value and age replace "now" */}
            <Blocks series={item.cpu.series} picked={picked} onPick={setPicked} />
            {picked !== null ? (
              <span className="num" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                {pct(item.cpu.series[picked])}
                <span className="m t3" style={{ fontSize: 10, marginLeft: 6 }}>{agoLabel(picked, item.cpu.series.length, FLEET_STEP_S)}</span>
              </span>
            ) : (
              <span className="num" style={{ color: hot ? 'var(--accent)' : 'var(--fg)', fontSize: 16, width: 44 }}>{pct(item.cpu.now)}</span>
            )}
          </>
        ) : item.busy || shape.busy ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minWidth: 0 }}>
            <span style={{ height: 8, width: 90, flex: 'none', background: 'var(--line)' }}>
              <span className="hatch" style={{ display: 'block', height: 8, width: `${item.busy?.progress ?? 100}%` }} />
            </span>
            <span className="m" style={{ fontSize: 11, color: 'var(--move)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.busy ? `${item.busy.command} ${item.busy.progress}%` : shape.label.toLowerCase()}
            </span>
          </span>
        ) : shape.running ? (
          <span className="m t3" style={{ fontSize: 11 }}>— no metrics yet</span>
        ) : (
          <span className="m t3" style={{ fontSize: 11 }}>— no metrics while off</span>
        )}
      </span>
      <span style={{ paddingRight: 24 }}>
        <span className="num" style={{ display: 'block', fontSize: 12.5, marginBottom: 6 }}>
          <span style={frac >= 0.8 ? { color: 'var(--warn)' } : undefined}>{tb(item.traffic.outBytes)}</span>
          <span className="t3"> / {tb(item.traffic.includedBytes)} TB</span>
        </span>
        <Meter fraction={frac} />
      </span>
      <span className="num" style={{ fontSize: item.priceUnknown ? 10.5 : 13, textAlign: 'right', color: item.priceUnknown ? 'var(--t3)' : undefined }} title={priceTitle(item)}>
        {item.priceUnknown ? '—' : euro(item.price)}
      </span>
      <span className="t3" style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Ic.ChevronRight />
      </span>
    </Link>
  )
}
