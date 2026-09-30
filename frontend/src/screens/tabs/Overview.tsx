import { useState } from 'react'
import { copyText } from '../../hooks'
import { Ic } from '../../icons'
import { agoLabel, AvgLine, CpuBars, StretchBlocks } from '../../components/charts'
import { Sec } from '../../components/ui'
import { compact, downsample, commandLabel, ago, duration, perfClass, storageLabel, tb } from '../../format'
import type { MetricsView, ServerDetail } from '../../types'

/** 01 · Overview — the instrument panel: now, hardware, traffic, signals,
 *  addresses, lifecycle. */
export default function Overview({ detail, desktop, m }: { detail: ServerDetail; desktop: boolean; onPower?: () => void; m: MetricsView | null }) {
  const range = desktop ? '24H' : '1H'

  const cpuSeries = m?.cpu.series ?? detail.cpu?.series ?? []
  // seconds between samples: the metrics step, or the detail sparkline's 300 s
  const stepS = m?.step ?? 300
  // mobile "now" chart: tap a column to read it (24 columns sampled from the series)
  const [picked, setPicked] = useState<number | null>(null)
  const cols = downsample(cpuSeries, 24)
  const origIndex = (i: number) => (cpuSeries.length > cols.length ? Math.round((i * (cpuSeries.length - 1)) / (cols.length - 1)) : i)
  const pickedOn = picked !== null && picked < cols.length
  const cpuNow = m?.cpu.now ?? detail.cpu?.now ?? 0
  const cpuAvg = m?.cpu.avg ?? 0
  const cpuPeak = m?.cpu.peak ?? 0
  const diskRead = m?.disk.read.at(-1) ?? 0
  const diskWrite = m?.disk.write.at(-1) ?? 0
  const netIn = m?.net.in.at(-1) ?? 0
  const netOut = m?.net.out.at(-1) ?? 0

  const frac = detail.traffic.includedBytes > 0 ? detail.traffic.outBytes / detail.traffic.includedBytes : 0
  const signals = buildSignals(detail)

  if (desktop) {
    return (
      <>
        <section style={{ padding: '22px 28px 0' }}>
          <Sec
            n="01"
            title={`CPU · ${range === '24H' ? '24 h' : '60 min'} · ÷ ${detail.type.cores} cores`}
            right={
              <span className="m t3" style={{ fontSize: 10.5 }}>
                NOW <span style={{ color: 'var(--fg)' }}>{Math.round(cpuNow)}%</span> · AVG{' '}
                <span style={{ color: 'var(--fg)' }}>{Math.round(cpuAvg)}%</span> · PEAK{' '}
                <span style={{ color: 'var(--accent)' }}>{Math.round(cpuPeak)}%</span>
              </span>
            }
          />
          <CpuChart series={cpuSeries} avg={cpuAvg} height={128} stepS={stepS} axis={range === '24H' ? ['−24 H', '−16', '−8', 'NOW'] : ['−60', '−30', 'NOW']} />
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 20, padding: '24px 28px 0' }}>
          <div>
            <Sec n="02" title="Hardware" />
            <div className="grid1" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              <HwCell label="vCPU" value={String(detail.type.cores)} />
              <HwCell label="Memory" value={`${Math.round(detail.type.memoryGb)} GB`} />
              <HwCell label="Disk" value={`${detail.type.diskGb} GB`} />
            </div>
            <div className="m t3" style={{ fontSize: 10.5, marginTop: 8 }}>
              {detail.type.cpuType.toUpperCase()} · {detail.type.arch.toUpperCase()} · {storageLabel(detail.type.storage)} · {(detail.datacenter || detail.location.code).toUpperCase()}
            </div>
          </div>
          <div>
            <Sec n="03" title="Traffic · this period" right={<span className="m t3" style={{ fontSize: 10.5 }}>IN {tb(detail.traffic.inBytes)} TB</span>} />
            <div className="num" style={{ fontSize: 26 }}>
              {tb(detail.traffic.outBytes)}
              <span className="t3" style={{ fontSize: 14 }}> / {tb(detail.traffic.includedBytes)} TB out</span>
            </div>
            <div style={{ marginTop: 12 }}>
              <BigMeter frac={frac} />
            </div>
          </div>
        </div>

        <section style={{ padding: '24px 28px 0' }}>
          <Sec n="04" title="Signals" />
          <div className="grid1" style={{ gridTemplateColumns: 'repeat(8, minmax(0, 1fr))' }}>
            {signals.map((s) => (
              <div key={s.label} style={{ padding: 12, height: 92, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <span className="t2">{s.icon}</span>
                <span>
                  <span className="eb" style={{ fontSize: 9, display: 'block' }}>{s.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: s.tone }}>{s.value}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 20, padding: '24px 28px 0' }}>
          <div>
            <Sec n="05" title="Addresses" />
            <div className="card">
              <AddrRow label="IPv4" value={detail.ipv4 || '—'} sub={detail.rdns.find((r) => r.family === 'IPv4')?.dnsPtr || (detail.ipv4 ? 'NO rDNS' : 'NO IPv4')} />
              <AddrRow label="IPv6" value={detail.ipv6 || '—'} sub={detail.rdns.find((r) => r.family === 'IPv6')?.dnsPtr || (detail.ipv6 ? 'NO rDNS' : 'NO IPv6')} last />
            </div>
          </div>
          <div>
            <Sec n="06" title="Latest actions" right={<span className="src">{detail.actionsTotal} total</span>} />
            <div className="card">
              {detail.actions.length === 0 && (
                <p className="m t3" style={{ fontSize: 11, padding: '0 12px', margin: 0, height: 52, display: 'flex', alignItems: 'center' }}>
                  No actions recorded yet.
                </p>
              )}
              {detail.actions.slice(0, 2).map((a) => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', height: 52, borderBottom: '1px solid var(--line)' }}>
                  <span className={a.status === 'error' ? 'sq sq-err' : a.status === 'running' ? 'sq sq-move' : 'sq sq-run'} style={{ width: 8, height: 8 }} />
                  <span style={{ flex: 1, fontSize: 13 }}>
                    {commandLabel(a.command)} <span className="m t3" style={{ fontSize: 10.5 }}>· {duration(a.durationS)}</span>
                  </span>
                  <span className="m t3" style={{ fontSize: 10.5 }}>{ago(a.started)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </>
    )
  }

  // ---- mobile ----------------------------------------------------------

  return (
    <>
      <section style={{ padding: '20px 16px 0' }}>
        <Sec n="01" title="Now" />
        <div className="grid1" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <div style={{ gridColumn: 'span 2', padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span className="eb">CPU · ÷ {detail.type.cores} cores</span>
              <span className="m t3" style={{ fontSize: 10.5 }}>
                {pickedOn ? (
                  <span style={{ color: 'var(--fg)' }}>
                    {agoLabel(origIndex(picked), cpuSeries.length, stepS)} · {cols[picked].toFixed(1)}%
                  </span>
                ) : (
                  `AVG ${Math.round(cpuAvg)}% · PEAK ${Math.round(cpuPeak)}%`
                )}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginTop: 12 }}>
              <span className="num" style={{ fontSize: 44, lineHeight: 0.85, fontWeight: 500 }}>
                {Math.round(cpuNow)}
                <span className="t3" style={{ fontSize: 20 }}>%</span>
              </span>
              <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end' }}>
                <StretchBlocks series={cols} picked={pickedOn ? picked : null} onPick={(i) => setPicked(i === picked ? null : i)} />
              </div>
            </div>
            <div className="m t3" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginTop: 8, paddingLeft: 74 }}>
              <span>−60</span>
              <span>−30</span>
              <span>NOW</span>
            </div>
          </div>
          <div style={{ padding: 14 }}>
            <div className="eb">Disk R / W</div>
            <div className="num" style={{ fontSize: 18, marginTop: 10 }}>
              {diskRead.toFixed(1)}
              <span className="t3"> / </span>
              {diskWrite.toFixed(1)}
            </div>
            <div className="m t3" style={{ fontSize: 10.5, marginTop: 4 }}>
              MB/s · {Math.round((m?.disk.iopsRead ?? 0) + (m?.disk.iopsWrite ?? 0))} IOPS
            </div>
          </div>
          <div style={{ padding: 14 }}>
            <div className="eb">Net in / out</div>
            <div className="num" style={{ fontSize: 18, marginTop: 10 }}>
              {netIn.toFixed(1)}
              <span className="t3"> / </span>
              {netOut.toFixed(1)}
            </div>
            <div className="m t3" style={{ fontSize: 10.5, marginTop: 4 }}>
              Mbit/s · {compact((m?.net.ppsIn ?? 0) + (m?.net.ppsOut ?? 0))} pps
            </div>
          </div>
        </div>
      </section>

      <section style={{ padding: '28px 16px 0' }}>
        <Sec n="02" title="Hardware" />
        <div className="grid1" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <HW label="vCPU" value={String(detail.type.cores)} sub={`${detail.type.cpuType.toUpperCase()} · ${detail.type.arch}`} />
          <HW label="Memory" value={`${Math.round(detail.type.memoryGb)}`} unit="GB" sub="RAM" />
          <HW label="Disk" value={String(detail.type.diskGb)} unit="GB" sub={storageLabel(detail.type.storage).toUpperCase()} />
          <HW label="Type" value={detail.type.name.toUpperCase()} small sub={perfClass(detail.type.category, detail.type.name)} />
          <HW label="Image" value={detail.image.replace(/ [0-9.]+$/, '')} text sub="SYSTEM" suffix={detail.image.match(/[0-9.]+$/)?.[0]} />
          <HW label="Location" value={detail.location.code} small sub={`${detail.location.city.toUpperCase()} · ${detail.location.country}`} />
        </div>
      </section>

      <section style={{ padding: '28px 16px 0' }}>
        <Sec n="03" title="Traffic · this period" />
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span className="num" style={{ fontSize: 34 }}>
            {tb(detail.traffic.outBytes)}
            <span className="t3" style={{ fontSize: 16 }}> / {tb(detail.traffic.includedBytes)} TB out</span>
          </span>
          <span className="m t3" style={{ fontSize: 11 }}>{(frac * 100).toFixed(1)}%</span>
        </div>
        <div style={{ marginTop: 12 }}>
          <BigMeter frac={frac} />
        </div>
        <div className="m t3" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, marginTop: 8 }}>
          <span>1 CELL = {tb(detail.traffic.includedBytes / 20)} TB</span>
          <span>IN {tb(detail.traffic.inBytes)} TB · NOT BILLED</span>
        </div>
      </section>

      <section style={{ padding: '28px 16px 0' }}>
        <Sec n="04" title="Signals" />
        <div className="grid1" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          {signals.map((s) => (
            <div key={s.label} style={{ padding: '10px 8px 10px 10px', height: 88, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <span className="t2">{s.icon}</span>
              <span>
                <span className="eb" style={{ fontSize: 9, display: 'block' }}>{s.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: s.tone }}>{s.value}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: '28px 16px 0' }}>
        <Sec n="05" title="Addresses" />
        <div className="card">
          <AddrRow label="IPv4" value={detail.ipv4 || '—'} sub={detail.rdns.find((r) => r.family === 'IPv4')?.dnsPtr || (detail.ipv4 ? 'NO rDNS' : 'NO IPv4')} />
          <AddrRow label="IPv6" value={detail.ipv6 || '—'} sub={detail.rdns.find((r) => r.family === 'IPv6')?.dnsPtr || (detail.ipv6 ? 'NO rDNS' : 'NO IPv6')} last />
        </div>
      </section>

      <Lifecycle detail={detail} />
    </>
  )
}

// ---- pieces ------------------------------------------------------------

function HwCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '10px 12px', height: 70 }}>
      <span className="eb" style={{ fontSize: 9 }}>{label}</span>
      <span className="num" style={{ display: 'block', fontSize: 22, marginTop: 6 }}>{value}</span>
    </div>
  )
}

/** Mobile hardware tile (1:1). */
function HW({
  label,
  value,
  sub,
  unit,
  small,
  text,
  suffix,
}: {
  label: string
  value: string
  sub: string
  unit?: string
  small?: boolean
  text?: boolean
  suffix?: string
}) {
  return (
    <div style={{ padding: 12, aspectRatio: '1 / 1', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <span className="eb">{label}</span>
      <span>
        {text ? (
          <span style={{ fontSize: 16, fontWeight: 600, display: 'block', lineHeight: 1.15 }}>
            {value}
            {suffix ? ` ${suffix}` : ''}
          </span>
        ) : (
          <span className="num" style={{ fontSize: small ? 22 : 30, display: 'block' }}>
            {value}
            {unit && <span className="t3" style={{ fontSize: 14 }}> {unit}</span>}
          </span>
        )}
        <span className="m t3" style={{ fontSize: 10 }}>{sub}</span>
      </span>
    </div>
  )
}

function AddrRow({ label, value, sub, last }: { label: string; value: string; sub: string; last?: boolean }) {
  const [copied, setCopied] = useState(false)
  const copyable = !!value && value !== '—'
  const copy = () => {
    void copyText(value).then((ok) => {
      if (!ok) return
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 6px 12px 14px', borderBottom: last ? undefined : '1px solid var(--line)' }}>
      <span className="eb" style={{ width: 34 }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="m" style={{ fontSize: 15, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
        {/* one fixed line in both states: a long PTR or "COPIED" never resizes the row */}
        <span
          className="m"
          style={{ display: 'block', fontSize: 10.5, lineHeight: '14px', height: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: copied ? 'var(--run)' : 'var(--t3)' }}
          title={sub}
        >
          {copied ? 'COPIED' : sub}
        </span>
      </span>
      {copyable && (
        <button type="button" className="btn btn-ico btn-bare" aria-label={copied ? `${label} copied` : `Copy ${label}`} onClick={copy}>
          {copied ? <Ic.Check /> : <Ic.Copy />}
        </button>
      )}
    </div>
  )
}

function BigMeter({ frac, height = 22 }: { frac: number; height?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(20, minmax(0, 1fr))', gap: 3 }}>
      {Array.from({ length: 20 }).map((_, i) => {
        const k = frac > 0 ? Math.max(1, Math.round(frac * 20)) : 0
        const cls = i < k ? (frac >= 0.8 ? 'tm warn' : 'tm on') : 'tm'
        return <span key={i} className={cls} style={{ height }} />
      })}
    </div>
  )
}

/** Desktop CPU columns — pickable like the metrics tab: hover/click a
 *  column to read its time and value. */
function CpuChart({ series, avg, height, axis, stepS }: { series: number[]; avg: number; height: number; axis: string[]; stepS: number }) {
  const [picked, setPicked] = useState<number | null>(null)
  const on = picked !== null && picked < series.length
  return (
    <>
      <CpuBars series={series} height={height} picked={on ? picked : null} onPick={setPicked}>
        <AvgLine value={avg} />
      </CpuBars>
      <div className="m t3" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginTop: 6 }}>
        {axis.map((a) => (
          <span key={a}>{a}</span>
        ))}
      </div>
      <div className="m" style={{ fontSize: 11, height: 16, marginTop: 6, color: on ? 'var(--fg)' : 'var(--t4)' }}>
        {on ? `${agoLabel(picked, series.length, stepS)} · CPU ${series[picked].toFixed(1)}%` : 'HOVER A BAR TO READ IT'}
      </div>
    </>
  )
}

interface Signal {
  label: string
  value: string
  tone?: string
  icon: React.ReactNode
}

function buildSignals(d: ServerDetail): Signal[] {
  return [
    { label: 'Power', value: d.status === 'running' ? 'On' : 'Off', tone: d.status === 'running' ? 'var(--run)' : undefined, icon: <Ic.Power /> },
    { label: 'Locked', value: d.locked ? 'Yes' : 'No', tone: d.locked ? 'var(--warn)' : undefined, icon: <Ic.Lock /> },
    { label: 'Rescue', value: d.rescue ? 'On' : 'Off', tone: d.rescue ? 'var(--warn)' : undefined, icon: <Ic.Rescue /> },
    { label: 'ISO', value: d.iso ? 'Mounted' : 'None', tone: d.iso ? 'var(--warn)' : undefined, icon: <Ic.Disc /> },
    // public_net.ipv4/ipv6.blocked — Hetzner blocks an IP after abuse reports.
    { label: 'IP block', value: d.ipBlocked ? 'Blocked' : 'Clear', tone: d.ipBlocked ? 'var(--warn)' : undefined, icon: <Ic.Globe /> },
    { label: 'Backups', value: d.backups ? 'On' : 'Off', icon: <Ic.Box /> },
    { label: 'Protect', value: d.protectDelete || d.protectRebuild ? 'On' : 'Off', icon: <Ic.Shield /> },
    { label: 'Type', value: d.type.deprecated ? 'Legacy' : 'Current', tone: d.type.deprecated ? 'var(--warn)' : undefined, icon: <Ic.Chip /> },
  ]
}

/** 06 · Lifecycle — the loaded actions on a created → now ruler (tap a
 *  tick to see which action it is) and the list, newest first. */
function Lifecycle({ detail }: { detail: ServerDetail }) {
  const [all, setAll] = useState(false)
  const [picked, setPicked] = useState<number | null>(null)
  const created = new Date(detail.created).getTime()
  const now = Date.now()
  const span = Math.max(1, now - created)

  // newest first, whatever order the API used
  const actions = [...detail.actions].sort((a, b) => new Date(b.started).getTime() - new Date(a.started).getTime())
  const shown = all ? actions : actions.slice(0, 5)
  const pickedAction = actions.find((a) => a.id === picked) ?? null
  const tone = (s: string) => (s === 'error' ? 'var(--accent)' : s === 'running' ? 'var(--move)' : 'var(--t2)')
  // marks on the created → now ruler, oldest → newest (left → right)
  const ticks = actions
    .slice(0, 20)
    .map((a) => ({ a, pos: Math.min(96, Math.max(2, ((new Date(a.started).getTime() - created) / span) * 100)) }))
    .sort((p, q) => p.pos - q.pos)

  const startLabel = new Date(detail.created)
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .toUpperCase()

  return (
    <section style={{ padding: '28px 16px 40px' }}>
      <Sec n="06" title="Lifecycle" />
      {/* One hit surface for the whole ruler: a tap picks the NEAREST mark.
          (Per-mark buttons overlapped — the picked one sat on top and ate
          the taps meant for its neighbours.) Tapping a cluster again cycles
          through the marks under the finger; ←/→ walk the actions. */}
      <div
        role="slider"
        tabIndex={0}
        aria-label="Lifecycle actions"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, ticks.length - 1)}
        aria-valuenow={Math.max(0, ticks.findIndex((t) => t.a.id === picked))}
        aria-valuetext={pickedAction ? `${commandLabel(pickedAction.command)}, ${ago(pickedAction.started)}` : 'none'}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const x = e.clientX - r.left
          const near = ticks
            .map((t) => ({ id: t.a.id, d: Math.abs((t.pos / 100) * r.width - x) }))
            .filter((t) => t.d <= 16)
            .sort((p, q) => p.d - q.d)
          if (!near.length) return setPicked(null)
          const at = near.findIndex((t) => t.id === picked)
          setPicked(near[at === -1 ? 0 : (at + 1) % near.length].id)
        }}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
          e.preventDefault()
          const i = ticks.findIndex((t) => t.a.id === picked)
          const next = i === -1 ? (e.key === 'ArrowLeft' ? ticks.length - 1 : 0) : Math.min(ticks.length - 1, Math.max(0, i + (e.key === 'ArrowRight' ? 1 : -1)))
          if (ticks[next]) setPicked(ticks[next].a.id)
        }}
        style={{ position: 'relative', height: 54, cursor: 'pointer', outlineOffset: 4 }}
      >
        <div style={{ position: 'absolute', left: 0, right: 0, top: 22, height: 1, background: 'var(--line3)' }} />
        <span style={{ position: 'absolute', left: 0, top: 16, width: 12, height: 12, background: 'var(--fg)' }} />
        <span style={{ position: 'absolute', right: 0, top: 16, width: 12, height: 12, background: 'var(--accent)' }} />
        {ticks.map(({ a, pos }) => {
          const on = a.id === picked
          return (
            <span
              key={a.id}
              style={{
                position: 'absolute',
                top: on ? 16 : 18,
                left: `calc(${pos}% - ${on ? 6 : 4}px)`,
                width: on ? 12 : 8,
                height: on ? 12 : 8,
                background: on ? 'var(--fg)' : tone(a.status),
                boxShadow: on ? '0 0 0 2px var(--bg)' : undefined,
                zIndex: on ? 2 : 1,
                pointerEvents: 'none',
              }}
            />
          )
        })}
        <span className="m t3" style={{ position: 'absolute', left: 0, top: 38, fontSize: 10 }}>{startLabel}</span>
        <span className="m t3" style={{ position: 'absolute', right: 0, top: 38, fontSize: 10 }}>
          NOW · {Math.floor(span / 86400000)} D
        </span>
      </div>
      <div className="m" style={{ fontSize: 11, marginTop: 8, height: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: pickedAction ? 'var(--fg)' : 'var(--t4)' }}>
        {pickedAction
          ? `${commandLabel(pickedAction.command).toUpperCase()} · ${pickedAction.status === 'error' ? `FAILED · ${pickedAction.errorCode || 'error'}` : duration(pickedAction.durationS)} · ${ago(pickedAction.started).toUpperCase()}`
          : 'TAP A MARK TO SEE THE ACTION'}
      </div>
      <div className="card" style={{ marginTop: 10 }}>
        {shown.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setPicked(a.id === picked ? null : a.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 14px', borderBottom: '1px solid var(--line-row)', background: a.id === picked ? 'var(--skel)' : undefined }}
          >
            <span className={a.status === 'error' ? 'sq sq-err' : a.status === 'running' ? 'sq sq-move' : 'sq sq-run'} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 500, display: 'block' }}>{commandLabel(a.command)}</span>
              <span className="m t3" style={{ fontSize: 10.5 }}>
                {a.status === 'error' ? `${a.command} · failed · ${a.errorCode || 'error'}` : `${a.command} · ${duration(a.durationS)}`}
              </span>
            </span>
            <span className="m t3" style={{ fontSize: 11, textAlign: 'right' }}>{ago(a.started)}</span>
          </button>
        ))}
        {actions.length > 5 && !all && (
          <button
            type="button"
            className="m t2"
            style={{ width: '100%', height: 44, fontSize: 11, letterSpacing: '.12em', textAlign: 'center' }}
            onClick={() => setAll(true)}
          >
            SHOW {actions.length} LATEST{detail.actionsTotal > actions.length ? ` OF ${detail.actionsTotal}` : ''}
          </button>
        )}
        {actions.length === 0 && (
          <p className="m t3" style={{ fontSize: 11, padding: 14, margin: 0 }}>
            No actions recorded yet.
          </p>
        )}
      </div>
    </section>
  )
}
