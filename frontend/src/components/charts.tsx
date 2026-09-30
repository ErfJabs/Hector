// Block charts and meters — every mark is a 4px-grid square/cell as the
// design system prescribes ("data marks" section of the foundations board).

/** One column = 5 stacked cells; lit from the bottom, hot above 85%. */
function BlockColumn({ value, stretch, dim }: { value: number; stretch?: boolean; dim?: boolean }) {
  const lit = value > 0 ? Math.max(1, Math.round((value / 100) * 5)) : 0
  const cells = []
  for (let r = 4; r >= 0; r--) {
    const on = r < lit
    cells.push(<span key={r} className={on ? (value >= 85 ? 'bk hot' : 'bk on') : 'bk'} />)
  }
  return (
    <div className={stretch ? 'bkc bkL' : 'bkc'} style={dim ? { opacity: 0.3 } : undefined}>
      {cells}
    </div>
  )
}

/** Pointer handlers for a pickable chart. Inside a card link the tap must
 *  inspect the chart, not open the server. */
function pickHandlers(n: number, onPick?: (i: number | null) => void) {
  if (!onPick) return {}
  return {
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      e.preventDefault()
      e.stopPropagation()
      onPick(pickAt(e, n))
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse') onPick(pickAt(e, n))
    },
    onPointerLeave: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse') onPick(null)
    },
    style: { cursor: 'crosshair' },
  }
}

/** The list-card sparkline: fixed 5px columns. */
export function Blocks({ series, picked = null, onPick }: { series: number[] } & Pickable) {
  const h = pickHandlers(series.length, onPick)
  return (
    <div {...h} style={{ display: 'flex', gap: 1, alignItems: 'flex-end', padding: '4px 0', margin: '-4px 0', ...h.style }}>
      {series.map((v, i) => (
        <BlockColumn key={i} value={v} dim={picked !== null && picked !== i} />
      ))}
    </div>
  )
}

/** The overview chart: columns stretch to fill width (bkc bkL). */
export function StretchBlocks({ series, picked = null, onPick }: { series: number[] } & Pickable) {
  const h = pickHandlers(series.length, onPick)
  return (
    <div {...h} style={{ display: 'flex', gap: 2, alignItems: 'flex-end', flex: 1, ...h.style }}>
      {series.map((v, i) => (
        <BlockColumn key={i} value={v} stretch dim={picked !== null && picked !== i} />
      ))}
    </div>
  )
}

/** "−25 MIN" / "−3 H" for column i of n sampled every stepS seconds. */
export function agoLabel(i: number, n: number, stepS: number): string {
  const s = (n - 1 - i) * stepS
  if (s <= 0) return 'NOW'
  if (s < 3600) return `−${Math.round(s / 60)} MIN`
  if (s < 86400 * 2) return `−${(s / 3600).toFixed(s < 36000 ? 1 : 0)} H`
  return `−${Math.round(s / 86400)} D`
}

/** 20-cell allowance meter; amber from 80%. */
export function Meter({ fraction, n = 20 }: { fraction: number; n?: number }) {
  const k = fraction > 0 ? Math.max(1, Math.round(fraction * n)) : 0
  const warn = fraction >= 0.8
  const cells = []
  for (let i = 0; i < n; i++) {
    cells.push(<span key={i} className={i < k ? (warn ? 'tm warn' : 'tm on') : 'tm'} />)
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gap: 2 }}>{cells}</div>
  )
}

/** Tap/hover → which column is under the pointer (charts are plain divs). */
function pickAt(e: { clientX: number; currentTarget: HTMLElement }, n: number): number | null {
  if (n === 0) return null
  const r = e.currentTarget.getBoundingClientRect()
  const i = Math.floor(((e.clientX - r.left) / r.width) * n)
  return Math.min(n - 1, Math.max(0, i))
}

export interface Pickable {
  /** index of the inspected column, null = none */
  picked?: number | null
  onPick?: (i: number | null) => void
}

/** CPU columns: percentage of the chart height, peak in signal red. */
export function CpuBars({
  series,
  height = 150,
  children,
  picked = null,
  onPick,
}: { series: number[]; height?: number; children?: React.ReactNode } & Pickable) {
  const peak = Math.max(...series, 0)
  const peakAt = peak > 0 ? series.indexOf(peak) : -1
  return (
    <div
      onPointerLeave={onPick ? (e) => e.pointerType === 'mouse' && onPick(null) : undefined}
      style={{ position: 'relative', height, borderBottom: '1px solid var(--line4)' }}
    >
      {[0, 25, 50, 75].map((top) => (
        <span key={top} style={{ position: 'absolute', left: 0, right: 0, top: `${top}%`, borderTop: '1px solid var(--gridline)' }} />
      ))}
      <div
        style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: 2, cursor: onPick ? 'crosshair' : undefined }}
        onClick={onPick ? (e) => onPick(pickAt(e, series.length)) : undefined}
        onPointerMove={onPick ? (e) => e.pointerType === 'mouse' && onPick(pickAt(e, series.length)) : undefined}
      >
        {series.map((v, i) => (
          <span
            key={i}
            style={{
              flex: 1,
              height: `${Math.min(100, Math.max(0, v))}%`,
              minHeight: v > 0 ? 1 : 0,
              background: i === peakAt ? 'var(--accent)' : 'var(--bar)',
              opacity: picked === null || picked === i ? 1 : 0.35,
            }}
          />
        ))}
      </div>
      {children}
      <span className="m t3" style={{ position: 'absolute', right: 0, top: -2, fontSize: 9.5, background: 'var(--bg)', paddingLeft: 4 }}>100</span>
      <span className="m t3" style={{ position: 'absolute', right: 0, top: 'calc(50% - 6px)', fontSize: 9.5, background: 'var(--bg)', paddingLeft: 4 }}>50</span>
    </div>
  )
}

/** Dashed average line over a cpu chart. */
export function AvgLine({ value }: { value: number }) {
  return (
    <span
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: `${Math.min(100, Math.max(0, value))}%`,
        borderTop: '1px dashed var(--avg-line)',
      }}
    />
  )
}

/** Mirrored columns: read above, write below, one baseline. */
export function MirrorBars({
  up,
  down,
  upColor = 'var(--bar)',
  downColor = 'var(--bar2)',
  height = 60,
  picked = null,
  onPick,
}: {
  up: number[]
  down: number[]
  upColor?: string
  downColor?: string
  height?: number
} & Pickable) {
  const max = Math.max(1e-9, ...up, ...down)
  const n = Math.max(up.length, down.length)
  const bars = (vals: number[], color: string, fromBottom: boolean) =>
    vals.map((v, i) => (
      <span
        key={i}
        style={{
          flex: 1,
          height: `${Math.max(0, (v / max) * 100)}%`,
          background: color,
          alignSelf: fromBottom ? 'flex-end' : 'flex-start',
          opacity: picked === null || picked === i ? 1 : 0.35,
        }}
      />
    ))
  return (
    <div
      style={{ cursor: onPick ? 'crosshair' : undefined }}
      onClick={onPick ? (e) => onPick(pickAt(e, n)) : undefined}
      onPointerMove={onPick ? (e) => e.pointerType === 'mouse' && onPick(pickAt(e, n)) : undefined}
      onPointerLeave={onPick ? (e) => e.pointerType === 'mouse' && onPick(null) : undefined}
    >
      <div style={{ height, display: 'flex', alignItems: 'flex-end', gap: 2 }}>{bars(up, upColor, true)}</div>
      <div style={{ height: 1, background: 'var(--line4)' }} />
      <div style={{ height, display: 'flex', alignItems: 'flex-start', gap: 2 }}>{bars(down, downColor, false)}</div>
    </div>
  )
}
