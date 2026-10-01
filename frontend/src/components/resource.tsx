import { useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, API, notifyResource, session } from '../api'
import { useAsync, useIsDesktop, useOnChanged } from '../hooks'
import { Ic } from '../icons'
import type { ActionResult } from '../types'
import { ConfirmDialog } from './confirm'
import { Overlay } from './sheets'
import { SectionNav, SubTabs, type SubTab } from './section'
import { ErrorPanel } from './states'
import { TopBar } from './topbar'
import { useToast } from './toast'

/** "03" — the count that sits next to the section title. */
export const pad2 = (n: number) => String(n).padStart(2, '0')

const message = (err: unknown) => (err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err))

// ---- one resource screen -------------------------------------------------

export interface Col<T> {
  key: string
  head: string
  render: (row: T) => ReactNode
}

export interface Ctx<T> {
  row: T
  close: () => void
  /** run a Hetzner action and follow it with a progress toast */
  act: (title: string, p: Promise<ActionResult>) => Promise<ActionResult | null>
  /** create / rename / delete: one request, one toast */
  mutate: (title: string, p: Promise<unknown>, opts?: { close?: boolean }) => Promise<boolean>
}

export interface ResourceSpec<T> {
  /** cache key; every mutation expires it and tells the screen to reload */
  cacheKey: string
  title: string
  n: string
  heading: string
  emptyCopy: string
  load: () => Promise<T[]>
  id: (row: T) => number
  name: (row: T) => string
  matches: (row: T, q: string) => boolean
  cols: Col<T>[]
  /** desktop grid-template-columns, one entry per col */
  grid: string
  card: (row: T) => ReactNode
  /** [label, value] rows for the detail sheet; gets the ctx so a row can
   *  carry its own buttons (a route's remove, an IP's reverse DNS) */
  detail: (ctx: Ctx<T>) => [string, ReactNode][]
  actions?: (ctx: Ctx<T>) => ReactNode
  create?: (ctx: { close: () => void; mutate: Ctx<T>['mutate'] }) => ReactNode
  createLabel?: string
  tabs?: SubTab[]
  chips?: { id: string; label: string; test: (row: T) => boolean }[]
  sort?: (rows: T[]) => T[]
  /** extra toolbar next to search (refresh, counts…) */
  ready?: boolean
}

export function ResourceScreen<T>(spec: ResourceSpec<T>) {
  const desktop = useIsDesktop()
  const navigate = useNavigate()
  const toast = useToast()

  const [query, setQuery] = useState('')
  const [chip, setChip] = useState(spec.chips?.[0]?.id ?? '')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const list = useAsync<T[]>(spec.load, [], { cache: { key: spec.cacheKey, ttlMs: 15000 } })
  useOnChanged(() => list.reload(true))
  const refresh = () => list.reload(true)

  const signOut = () => {
    session.clear()
    navigate('/signin', { replace: true })
  }

  const act = async (title: string, p: Promise<ActionResult>): Promise<ActionResult | null> => {
    try {
      const res = await p
      notifyResource(spec.cacheKey)
      const first = res.actions?.[0] ?? res.action
      if (first && first.id && first.status === 'running') {
        toast.trackAction(title, first, () => notifyResource(spec.cacheKey))
      } else {
        toast.push({ kind: 'success', title })
      }
      return res
    } catch (err) {
      toast.push({ kind: 'error', title, detail: message(err) })
      return null
    }
  }

  const mutate = async (title: string, p: Promise<unknown>, opts?: { close?: boolean }): Promise<boolean> => {
    try {
      await p
      notifyResource(spec.cacheKey)
      toast.push({ kind: 'success', title })
      if (opts?.close) setSelectedId(null)
      return true
    } catch (err) {
      toast.push({ kind: 'error', title, detail: message(err) })
      return false
    }
  }

  const all = list.data ?? []
  const q = query.trim().toLowerCase()
  const activeChip = spec.chips?.find((c) => c.id === chip)
  // the first chip is usually "All" (id '') — selected, but not a filter
  const filtering = !!q || !!(activeChip && activeChip.id !== '')
  let rows = all
  if (q) rows = rows.filter((r) => spec.matches(r, q))
  if (activeChip) rows = rows.filter((r) => activeChip.test(r))
  if (spec.sort) rows = spec.sort(rows)

  // Hold the id, not the object: after an action the list is replaced, and
  // the sheet must keep showing the row as Hetzner now reports it. A row that
  // disappeared (deleted) simply closes the sheet.
  const selected = selectedId == null ? null : (all.find((r) => spec.id(r) === selectedId) ?? null)
  const ctx = (row: T): Ctx<T> => ({ row, close: () => setSelectedId(null), act, mutate })

  const showSkeleton = list.loading && !list.data
  const showError = list.error && !list.data
  const noRows = list.data && rows.length === 0

  const toolbar = (
    <section style={{ padding: desktop ? '24px 40px 0' : '18px 16px 0' }}>
      <div className="head" style={{ marginBottom: 20 }}>
        <h1 className="d" style={{ fontSize: desktop ? 56 : 46 }}>
          {spec.title}
        </h1>
        <span className={rows.length ? 'd red' : 'd t3'} style={{ fontSize: desktop ? 56 : 46 }}>
          {pad2(rows.length)}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label className="field" style={{ flex: 1, minWidth: 0, height: desktop ? 44 : 48 }}>
          <span className="t3">
            <Ic.Search />
          </span>
          <input
            ref={searchRef}
            type="search"
            placeholder="Search"
            aria-label={`Search ${spec.title.toLowerCase()}`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ fontSize: desktop ? 14 : 16 }}
          />
        </label>
        {spec.create && (
          <button
            type="button"
            className="btn btn-red"
            style={{ height: desktop ? 44 : 48, padding: '0 16px', flex: 'none' }}
            onClick={() => setCreating(true)}
          >
            <Ic.Plus />
            {spec.createLabel ?? 'New'}
          </button>
        )}
      </div>
      {spec.chips && (
        <div className="hscroll" style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          {spec.chips.map((c) => (
            <button
              key={c.id}
              type="button"
              className={chip === c.id ? 'chip chip-on' : 'chip'}
              aria-pressed={chip === c.id}
              onClick={() => setChip(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
    </section>
  )

  const body = (
    <section style={{ padding: desktop ? '18px 40px 60px' : '16px 16px 60px' }}>
      {showSkeleton ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skel" style={{ height: desktop ? 58 : 108 }} />
          ))}
        </div>
      ) : showError && list.error ? (
        <ErrorPanel error={list.error} onRetry={refresh} />
      ) : noRows ? (
        <div style={{ padding: desktop ? '40px 0' : '24px 0' }}>
          <p style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2, margin: 0 }}>
            {filtering ? 'Nothing matches.' : spec.emptyCopy}
          </p>
          {!filtering && spec.create && (
            <button
              type="button"
              className="btn btn-red"
              style={{ width: '100%', height: 54, marginTop: 22, fontSize: 13 }}
              onClick={() => setCreating(true)}
            >
              <Ic.Plus />
              {spec.createLabel ?? 'New'}
            </button>
          )}
        </div>
      ) : desktop ? (
        <>
          <div
            className="eb tbl tbl-h"
            style={{ gridTemplateColumns: spec.grid, fontSize: 10, borderBottom: '1px solid var(--line3)' }}
          >
            {spec.cols.map((c) => (
              <span key={c.key}>{c.head}</span>
            ))}
          </div>
          {rows.map((row) => (
            <button
              key={spec.id(row)}
              type="button"
              className="tbl tbl-r"
              style={{ gridTemplateColumns: spec.grid }}
              onClick={() => setSelectedId(spec.id(row))}
            >
              {spec.cols.map((c) => (
                <span key={c.key} className="cell-ov">
                  {c.render(row)}
                </span>
              ))}
            </button>
          ))}
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((row) => (
            <button key={spec.id(row)} type="button" className="card-r" onClick={() => setSelectedId(spec.id(row))}>
              {spec.card(row)}
            </button>
          ))}
        </div>
      )}

      {list.error && list.data && (
        <div style={{ marginTop: 16 }}>
          <ErrorPanel error={list.error} onRetry={refresh} lastFetchedAt={new Date()} />
        </div>
      )}
    </section>
  )

  return (
    <div className={desktop ? 'page page--d' : 'page'}>
      <TopBar onRefresh={refresh} onSignOut={signOut} />
      <SectionNav />
      {spec.tabs && <SubTabs tabs={spec.tabs} />}
      {toolbar}
      {body}

      {selected && (
        <Sheet
          open
          onClose={() => setSelectedId(null)}
          eyebrow={`${spec.heading} · ${pad2(spec.id(selected))}`}
          title={spec.name(selected)}
          footer={
            spec.actions ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{spec.actions(ctx(selected))}</div>
            ) : undefined
          }
        >
          <DetailRows rows={spec.detail(ctx(selected))} />
        </Sheet>
      )}

      {spec.create && creating && (
        <Sheet open onClose={() => setCreating(false)} eyebrow="New" title={spec.createLabel ?? spec.title}>
          {spec.create({ close: () => setCreating(false), mutate })}
        </Sheet>
      )}
    </div>
  )
}

// ---- sheet + form primitives --------------------------------------------

export function Sheet({
  open,
  onClose,
  eyebrow,
  title,
  sub,
  children,
  footer,
  width = 560,
}: {
  open: boolean
  onClose: () => void
  eyebrow: string
  title: string
  sub?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  return (
    <Overlay open={open} onClose={onClose} label={title} width={width}>
      <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="eb">{eyebrow}</div>
          <h2 style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15 }}>{title}</h2>
          {sub && (
            <div className="m t3" style={{ fontSize: 11, marginTop: 6 }}>
              {sub}
            </div>
          )}
        </div>
        <button type="button" className="btn btn-ico btn-bare" aria-label="Close" onClick={onClose}>
          <Ic.X />
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px 24px' }}>{children}</div>
      {footer && (
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--line)', background: 'var(--card)' }}>{footer}</div>
      )}
    </Overlay>
  )
}

/** Read-only key/value block used by every detail sheet. `rows` is the value
 *  the screen's `detail()` returns — an array of [label, value] pairs. */
export function DetailRows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <div>
      {rows.map(([k, v]) => (
        <div
          key={k}
          style={{ display: 'flex', gap: 16, padding: '11px 0', borderBottom: '1px solid var(--line)', alignItems: 'baseline' }}
        >
          <span className="eb" style={{ width: 118, flex: 'none' }}>
            {k}
          </span>
          <span style={{ fontSize: 14, flex: 1, minWidth: 0, wordBreak: 'break-word' }}>{v}</span>
        </div>
      ))}
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <span className="lbl">{label}</span>
      {children}
      {hint && (
        <div className="m t3" style={{ fontSize: 11, marginTop: 7, lineHeight: 1.5 }}>
          {hint}
        </div>
      )}
    </div>
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  inputMode,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  inputMode?: 'numeric' | 'text' | 'decimal'
  disabled?: boolean
}) {
  return (
    <label className="field" style={disabled ? { opacity: 0.5 } : undefined}>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <label className="field-ta">
      <textarea value={value} placeholder={placeholder} rows={rows} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

export function Select({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  disabled?: boolean
}) {
  return (
    <label className="field" style={disabled ? { opacity: 0.5 } : undefined}>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
      />
      <span style={{ fontSize: 14 }}>{label}</span>
    </label>
  )
}

/** A full-width action button in a detail sheet footer. */
export function Act({
  children,
  onClick,
  tone = 'plain',
  disabled,
}: {
  children: ReactNode
  onClick: () => void
  tone?: 'plain' | 'primary' | 'danger'
  disabled?: boolean
}) {
  const cls = tone === 'primary' ? 'btn btn-red' : tone === 'danger' ? 'btn btn-dng' : 'btn btn-line'
  return (
    <button type="button" className={cls} style={{ width: '100%', height: 44 }} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

/** A confirm step on top of an open detail sheet. */
export function useConfirm() {
  const [open, setOpen] = useState(false)
  const confirm = {
    open,
    ask: () => setOpen(true),
    cancel: () => setOpen(false),
    dialog: (props: {
      eyebrow: string
      title: string
      confirmLabel: string
      onConfirm: () => void
      children?: ReactNode
    }) => (
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={props.onConfirm}
        eyebrow={props.eyebrow}
        title={props.title}
        confirmLabel={props.confirmLabel}
        danger
      >
        {props.children}
      </ConfirmDialog>
    ),
  }
  return confirm
}

/** Status pill: green when settled, hatched while Hetzner is working on it. */
export function StatusTag({ status }: { status: string }) {
  const s = status.toLowerCase()
  const cls =
    ['available', 'running', 'active', 'ready', 'ok'].includes(s)
      ? 'tag tag-run'
      : ['creating', 'deleting', 'migrating', 'updating', 'assigning', 'unassigning', 'resizing', 'pending'].includes(s)
        ? 'tag tag-move'
        : ['error', 'failed', 'degraded'].includes(s)
          ? 'tag tag-red'
          : 'tag tag-warn'
  return <span className={cls}>{status || '—'}</span>
}

/** Server picker data for attach/assign forms: reads the shared fleet cache
 *  so opening a picker never costs a fresh 1+N read when the fleet is warm. */
export function useServers(): { servers: { id: number; name: string; status: string }[]; error: ApiError | null } {
  const fleet = useAsync(() => API.fleet(false), [], { cache: { key: 'fleet', ttlMs: 15000 } })
  return { servers: fleet.data?.servers ?? [], error: fleet.error }
}
