import { useState } from 'react'
import { API } from '../../api'
import { useAsync } from '../../hooks'
import { Ic } from '../../icons'
import { AvgLine, CpuBars, MirrorBars } from '../../components/charts'
import { Sec } from '../../components/ui'
import type { MetricsView, ServerDetail } from '../../types'

const RANGES: Record<string, { step: string; axis: string[] }> = {
  '1H': { step: '60 s', axis: ['−60', '−40', '−20', 'NOW'] },
  '6H': { step: '9 min', axis: ['−6 H', '−4', '−2', 'NOW'] },
  '24H': { step: '36 min', axis: ['−24 H', '−16', '−8', 'NOW'] },
  '7D': { step: '4 h', axis: ['−7 D', '−5', '−2', 'NOW'] },
  '30D': { step: '18 h', axis: ['−30 D', '−20', '−10', 'NOW'] },
}

const avgOf = (vals: number[]) => (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0)

/** 03 · Metrics — cpu, disk and network. Hetzner reports exactly these
 *  three; memory would need an agent on the server. */
export default function Metrics({ serverId, detail, desktop }: { serverId: number; detail: ServerDetail; desktop: boolean }) {
  const [range, setRange] = useState('24H')
  // one inspected column index shared by all three charts (same time axis)
  const [picked, setPicked] = useState<number | null>(null)
  const st = useAsync<MetricsView>(() => API.metrics(serverId, range), [serverId, range], {
    pollMs: 30000,
    cache: { key: `metrics:${serverId}:${range}`, ttlMs: 60000 },
  })
  // show nothing from the previous range while the new one loads
  const m = st.data && st.data.range === range ? st.data : null

  const pad = desktop ? '22px 28px 0' : '16px 16px 0'
  const padSec = desktop ? { padding: '32px 28px 0' } : { padding: '32px 16px 0' }

  return (
    <>
      <section style={{ padding: pad, marginTop: 16 }}>
        <div className="grid1" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }} role="group" aria-label="Time range">
          {Object.keys(RANGES).map((k) => {
            const on = k === range
            return (
              <button
                key={k}
                type="button"
                className="m"
                aria-pressed={on}
                style={{
                  height: 44,
                  textAlign: 'center',
                  fontSize: 12,
                  letterSpacing: '.1em',
                  background: on ? 'var(--fg)' : 'var(--bg)',
                  color: on ? 'var(--bg)' : 'var(--t2)',
                }}
                onClick={() => {
                  setRange(k)
                  setPicked(null)
                }}
              >
                {k}
              </button>
            )
          })}
        </div>
      </section>

      <section style={padSec}>
        <Sec n="01" title={`CPU usage ÷ ${detail.type.cores} cores`} right={<span className="m t3" style={{ fontSize: 10.5 }}>STEP {RANGES[range].step}</span>} />
        <div style={{ display: 'flex', gap: 18, marginBottom: 14 }}>
          <Metric n="Now" v={m ? `${Math.round(m.cpu.now)}%` : '—'} />
          <Metric n="Avg" v={m ? `${Math.round(m.cpu.avg)}%` : '—'} />
          <Metric n="Peak" v={m ? `${Math.round(m.cpu.peak)}%` : '—'} tone="var(--accent)" />
        </div>
        {m && m.cpu.series.length === 0 ? (
          <div className="card m t3" style={{ height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, textAlign: 'center', padding: 16, lineHeight: 1.6 }}>
            NO SAMPLES YET · HETZNER STARTS REPORTING A FEW MINUTES AFTER BOOT
          </div>
        ) : m ? (
          <CpuBars series={m.cpu.series} height={150} picked={picked} onPick={setPicked}>
            <AvgLine value={m.cpu.avg} />
          </CpuBars>
        ) : (
          <div className="skel" style={{ height: 150 }} />
        )}
        <Axis labels={RANGES[range].axis} />
        <Readout m={m} i={picked} text={(mm, i) => `CPU ${fmt(mm.cpu.series[i], 1)}%`} />
      </section>

      <section style={padSec}>
        <Sec
          n="02"
          title="Disk throughput"
          right={
            <span className="m" style={{ fontSize: 10.5, letterSpacing: '.1em', color: 'var(--fg)' }}>
              MB/S <span className="t3">· IOPS</span>
            </span>
          }
        />
        <div className="m" style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
          <Legend color="var(--bar)" label="READ" value={m ? avgOf(m.disk.read).toFixed(1) : '—'} />
          <Legend color="var(--bar2)" label="WRITE" value={m ? avgOf(m.disk.write).toFixed(1) : '—'} />
        </div>
        {m ? (
          <MirrorBars up={m.disk.read} down={m.disk.write} height={60} picked={picked} onPick={setPicked} />
        ) : (
          <div className="skel" style={{ height: 121 }} />
        )}
        <Readout m={m} i={picked} text={(mm, i) => `READ ${fmt(mm.disk.read[i], 2)} · WRITE ${fmt(mm.disk.write[i], 2)} MB/s`} />
      </section>

      <section style={padSec}>
        <Sec
          n="03"
          title="Net bandwidth"
          right={
            <span className="m" style={{ fontSize: 10.5, letterSpacing: '.1em', color: 'var(--fg)' }}>
              MBIT/S <span className="t3">· PPS</span>
            </span>
          }
        />
        <div className="m" style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
          <Legend color="var(--bar)" label="IN" value={m ? avgOf(m.net.in).toFixed(1) : '—'} />
          <Legend color="var(--bar2)" label="OUT" value={m ? avgOf(m.net.out).toFixed(1) : '—'} />
        </div>
        {m ? (
          <MirrorBars up={m.net.in} down={m.net.out} height={70} picked={picked} onPick={setPicked} />
        ) : (
          <div className="skel" style={{ height: 141 }} />
        )}
        <Axis labels={RANGES[range].axis} />
        <Readout m={m} i={picked} text={(mm, i) => `IN ${fmt(mm.net.in[i], 2)} · OUT ${fmt(mm.net.out[i], 2)} Mbit/s`} />
      </section>

      <section style={desktop ? { padding: '32px 28px 40px' } : { padding: '32px 16px 40px' }}>
        <div className="card" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span className="t3">
            <Ic.Warn />
          </span>
          <p className="t2" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
            Hetzner reports CPU, disk and network only. Memory and disk-fill need an agent on the server, so they aren't shown here.
          </p>
        </div>
        {st.error && (
          <p className="m" style={{ fontSize: 11, color: 'var(--accent-soft)', marginTop: 12 }}>
            {st.error.message}
          </p>
        )}
      </section>
    </>
  )
}

function Metric({ n, v, tone }: { n: string; v: string; tone?: string }) {
  return (
    <div>
      <div className="eb" style={{ fontSize: 9.5 }}>{n}</div>
      <div className="num" style={{ fontSize: 26, marginTop: 4, color: tone ?? 'var(--fg)' }}>{v}</div>
    </div>
  )
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
      <span style={{ width: 9, height: 9, background: color }} />
      {label} {value}
    </span>
  )
}

const fmt = (v: number | undefined, d: number) => (v === undefined ? '—' : v.toFixed(d))

/** Time of column i: the series ends at "now" and steps back `step` seconds. */
function columnTime(m: MetricsView, i: number): string {
  const n = m.cpu.series.length || m.net.in.length || m.disk.read.length
  const t = new Date(Date.now() - (n - 1 - i) * m.step * 1000)
  const hm = t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return m.range === '7D' || m.range === '30D'
    ? `${t.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase()} ${hm}`
    : hm
}

/** What the tapped column is: its time and values. Fixed height, so the
 *  layout doesn't jump when a column is picked. */
function Readout({ m, i, text }: { m: MetricsView | null; i: number | null; text: (m: MetricsView, i: number) => string }) {
  const on = !!m && i !== null
  return (
    <div
      className="m"
      aria-live="polite"
      style={{ fontSize: 11, height: 16, marginTop: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: on ? 'var(--fg)' : 'var(--t4)' }}
    >
      {on ? `${columnTime(m, i)} · ${text(m, i)}` : 'TAP A BAR TO READ IT'}
    </div>
  )
}

function Axis({ labels }: { labels: string[] }) {
  return (
    <div className="m t3" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginTop: 7 }}>
      {labels.map((a) => (
        <span key={a}>{a}</span>
      ))}
    </div>
  )
}
