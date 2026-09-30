import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { API, CATALOG_CACHE, notifyChanged } from '../api'
import { useAsync, useIsDesktop } from '../hooks'
import { Ic } from '../icons'
import { Sw } from '../components/ui'
import { ErrorPanel } from '../components/states'
import { useToast } from '../components/toast'
import { euro, tierOf, type Tier } from '../format'
import type { Catalog, ServerDetail } from '../types'

/**
 * 06 · Rescale — pick the next type, keep or grow the disk, then let the
 * backend run shutdown → change_type as one tracked job.
 */
export default function Rescale() {
  const { id } = useParams()
  const serverId = Number(id)
  const navigate = useNavigate()
  const { state } = useLocation() as { state: { detail?: ServerDetail } | null }
  const toast = useToast()
  const desktop = useIsDesktop()

  const detailSt = useAsync<ServerDetail>(() => (state?.detail ? Promise.resolve(state.detail) : API.server(serverId)), [serverId])
  const catalogSt = useAsync<Catalog>(() => API.catalog(), [], { cache: CATALOG_CACHE })

  const detail = detailSt.data
  const catalog = catalogSt.data

  const [tier, setTier] = useState<Tier>('REGULAR')
  const [pick, setPick] = useState('')
  const [upgradeDisk, setUpgradeDisk] = useState(true)
  const [busy, setBusy] = useState(false)

  const current = detail?.type.name ?? ''
  const currentPrice = detail && catalog ? (catalog.serverTypes.find((t) => t.name === detail.type.name)?.prices[detail.location.code]?.monthly ?? detail.price) : 0

  const options = useMemo(() => {
    if (!catalog || !detail) return []
    return catalog.serverTypes
      .filter((t) => tierOf(t) === tier && !t.deprecated)
      .filter((t) => (detail.type.arch === 'arm' ? t.arch === 'arm' : t.arch === 'x86'))
      .sort((a, b) => a.cores - b.cores)
  }, [catalog, detail, tier])

  // A type is only a valid target if it's sold in this server's location
  // right now (no price entry / available=false → change_type would fail).
  const canPick = (t: (typeof options)[number]) =>
    !!detail && t.name !== detail.type.name && !!t.prices[detail.location.code]?.available

  // default selection: the smallest available type in the tier with more cores
  const selected =
    options.find((t) => t.name === pick && canPick(t)) ??
    options.find((t) => canPick(t) && t.cores > (detail?.type.cores ?? 0)) ??
    options.find(canPick)
  const selPrice = selected && detail ? (selected.prices[detail.location.code]?.monthly ?? 0) : 0

  const submit = async () => {
    if (!selected || busy || !detail) return
    setBusy(true)
    try {
      const job = await API.rescale(serverId, selected.name, upgradeDisk)
      notifyChanged()
      toast.trackJob(serverId, `Rescaling ${detail.name}`, job)
      navigate(`/servers/${serverId}/manage`)
    } catch (err) {
      toast.push({ kind: 'error', title: 'Rescale failed', detail: err instanceof Error ? err.message : 'error' })
      setBusy(false)
    }
  }

  const back = () => navigate(`/servers/${serverId}/manage`)

  useEffect(() => {
    if (!desktop) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') navigate(`/servers/${serverId}/manage`)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [desktop, navigate, serverId])

  if (!detail || !catalog) {
    const error = detailSt.error ?? catalogSt.error
    return (
      <div className={desktop ? 'page page--d' : 'page'}>
        <div style={{ padding: 16 }}>
          <button type="button" className="btn btn-ico btn-bare" aria-label="Back" onClick={back}>
            <Ic.Back />
          </button>
          {error ? (
            <div style={{ marginTop: 12 }}>
              <ErrorPanel
                error={error}
                onRetry={() => {
                  detailSt.reload()
                  catalogSt.reload()
                }}
              />
            </div>
          ) : (
            <>
              <div className="skel" style={{ height: 40, width: 180, marginTop: 12 }} />
              <div className="skel" style={{ height: 200, marginTop: 20 }} />
            </>
          )}
        </div>
      </div>
    )
  }

  const running = detail.status === 'running'
  const blocked = detail.locked || !!detail.busy

  const body = (
    <>
      <div style={{ padding: '8px 16px 0' }}>
        <h1 className="d" style={{ margin: 0, fontSize: 38 }}>
          Rescale
        </h1>
      </div>

      <section style={{ padding: '20px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'stretch' }} className="card">
          <div style={{ flex: 1, padding: '12px 14px' }}>
            <div className="eb" style={{ fontSize: 9.5 }}>From</div>
            <div className="num" style={{ fontSize: 20, marginTop: 6 }}>{detail.type.name.toUpperCase()}</div>
            <div className="m t3" style={{ fontSize: 10.5, marginTop: 4 }}>
              {detail.type.cores} · {Math.round(detail.type.memoryGb)} GB · {detail.type.diskGb} GB
            </div>
          </div>
          <div style={{ width: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderLeft: '1px solid var(--line)', borderRight: '1px solid var(--line)' }} className="red">
            <Ic.ChevronRight />
          </div>
          <div style={{ flex: 1, padding: '12px 14px' }}>
            <div className="eb" style={{ fontSize: 9.5, color: 'var(--accent)' }}>To</div>
            <div className="num" style={{ fontSize: 20, marginTop: 6 }}>{selected?.name.toUpperCase() ?? '—'}</div>
            <div className="m t3" style={{ fontSize: 10.5, marginTop: 4 }}>
              {selected ? `${selected.cores} · ${Math.round(selected.memoryGb)} GB · ${upgradeDisk ? selected.diskGb : detail.type.diskGb} GB` : '—'}
            </div>
          </div>
        </div>
      </section>

      <section style={{ padding: '14px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: 14, border: '1px solid var(--line2)' }}>
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>Upgrade disk</span>
            <span className="t3" style={{ display: 'block', fontSize: 12.5, lineHeight: 1.45, marginTop: 3 }}>
              Grow the disk to the new size. Off keeps {detail.type.diskGb} GB, so you can scale back down later.
            </span>
          </span>
          <Sw on={upgradeDisk} label="Upgrade disk" onToggle={() => setUpgradeDisk((v) => !v)} />
        </div>
      </section>

      <section style={{ padding: '22px 16px 0' }}>
        <div className="grid1" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {(['REGULAR', 'COST-OPT.', 'DEDICATED'] as Tier[]).map((t) => {
            const on = t === tier
            return (
              <button
                key={t}
                type="button"
                className="m"
                style={{ height: 42, textAlign: 'center', fontSize: 11, letterSpacing: '.1em', background: on ? 'var(--fg)' : 'var(--bg)', color: on ? 'var(--bg)' : 'var(--t2)' }}
                aria-pressed={on}
                onClick={() => {
                  setTier(t)
                  setPick('')
                }}
              >
                {t}
              </button>
            )
          })}
        </div>
        <div className="m t3" style={{ fontSize: 10.5, margin: '8px 0 10px' }}>
          {detail.type.arch.toUpperCase()} ONLY · ARCHITECTURE CAN'T CHANGE ON RESCALE
        </div>
        <div role="radiogroup" aria-label="Server type" style={{ borderTop: '1px solid var(--line)' }}>
          {options.map((t) => {
            const isCurrent = t.name === current
            const on = selected?.name === t.name
            const offer = t.prices[detail.location.code]
            const unavailable = !isCurrent && !offer?.available
            const price = offer?.monthly ?? 0
            const d = price - currentPrice
            return (
              <button
                key={t.name}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={isCurrent || unavailable}
                onClick={() => setPick(t.name)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  width: '100%',
                  minHeight: 64,
                  padding: '10px 12px 10px 14px',
                  border: `1px solid ${on ? 'var(--accent)' : 'transparent'}`,
                  borderBottom: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
                  opacity: isCurrent || unavailable ? 0.45 : 1,
                }}
              >
                <span style={{ width: 12, height: 12, flex: 'none', background: on ? 'var(--accent)' : undefined, boxShadow: on ? undefined : 'inset 0 0 0 1.5px var(--ctrl2)' }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="num" style={{ display: 'block', fontSize: 16 }}>
                    {t.name.toUpperCase()}{' '}
                    {isCurrent && <span className="m" style={{ fontSize: 10, letterSpacing: '.1em', color: 'var(--t3)' }}>CURRENT</span>}
                  </span>
                  <span className="m t3" style={{ display: 'block', fontSize: 11, marginTop: 3 }}>
                    {t.cores} vCPU · {Math.round(t.memoryGb)} GB · {upgradeDisk || isCurrent ? t.diskGb : detail.type.diskGb} GB
                  </span>
                </span>
                <span style={{ textAlign: 'right' }}>
                  <span className="num" style={{ display: 'block', fontSize: 14 }}>{unavailable ? '—' : euro(price)}</span>
                  <span className="m t3" style={{ display: 'block', fontSize: 10.5, marginTop: 3 }}>
                    {isCurrent ? '—' : unavailable ? `NOT IN ${detail.location.code}` : d >= 0 ? `+${euro(d)}` : `−${euro(-d)}`}
                  </span>
                </span>
              </button>
            )
          })}
          {options.length === 0 && (
            <p className="m t3" style={{ fontSize: 11, padding: '14px 2px' }}>
              No types in this tier for this architecture.
            </p>
          )}
        </div>
      </section>

      {blocked && (
        <section style={{ padding: '18px 16px 0' }}>
          <p className="m" style={{ fontSize: 11, color: 'var(--move)', margin: 0, lineHeight: 1.5 }}>
            ANOTHER ACTION IS RUNNING ON THIS SERVER · WAIT FOR IT TO FINISH.
          </p>
        </section>
      )}

      {running && (
        <section style={{ padding: '18px 16px 0' }}>
          <div style={{ display: 'flex', gap: 12, padding: '12px 14px', border: '1px solid var(--warn-line)', alignItems: 'flex-start' }}>
            <span style={{ color: 'var(--warn)' }}>
              <Ic.Warn />
            </span>
            <span style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--warn-text)' }}>
              {detail.name} is running. We'll send <span className="m">shutdown</span>, wait for off, then <span className="m">change_type</span>. Expect a few minutes of downtime.
            </span>
          </div>
        </section>
      )}

      <div style={{ padding: '22px 16px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <span className="m t2" style={{ fontSize: 11, letterSpacing: '.08em' }}>
            {detail.type.name.toUpperCase()} → {selected?.name.toUpperCase() ?? '—'}
          </span>
          <span className="num" style={{ fontSize: 16 }}>
            {euro(selPrice)}
            <span className="t3" style={{ fontSize: 12 }}>/mo</span>
          </span>
        </div>
        <button
          type="button"
          className={busy || !selected || blocked ? 'btn btn-red btn-dis' : 'btn btn-red'}
          style={{ width: '100%', height: 54, fontSize: 13 }}
          disabled={busy || !selected || blocked}
          onClick={submit}
        >
          {running ? 'Shut down & rescale' : 'Rescale'}
        </button>
      </div>
    </>
  )

  if (desktop) {
    return (
      <div className="page page--d" style={{ minHeight: '100vh' }}>
        <div style={{ position: 'fixed', inset: 0, background: 'var(--scrim2)', zIndex: 30 }} onClick={back} />
        <aside
          role="dialog"
          aria-label={`Rescale ${detail.name}`}
          className="sheet-scroll"
          style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 640, background: 'var(--panel)', borderLeft: '1px solid var(--line3)', zIndex: 40, overflowY: 'auto' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 28px 0' }}>
            <button type="button" className="btn btn-ico btn-bare" aria-label="Back" onClick={back}>
              <Ic.Back />
            </button>
            <span className="m t3" style={{ fontSize: 10.5, letterSpacing: '.1em' }}>{detail.name.toUpperCase()}</span>
            <span style={{ width: 44 }} />
          </div>
          {body}
        </aside>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="grab" />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px 0' }}>
        <button type="button" className="btn btn-ico btn-bare" aria-label="Back" onClick={back}>
          <Ic.Back />
        </button>
        <span className="m t3" style={{ fontSize: 10.5, letterSpacing: '.1em' }}>{detail.name.toUpperCase()}</span>
        <span style={{ width: 44 }} />
      </div>
      {body}
    </div>
  )
}
