import { useMemo, useState } from 'react'
import { byVersionDesc } from '../format'
import type { Catalog } from '../types'

export type Img = Catalog['images'][number]
type Tab = 'SYSTEM' | 'APPS' | 'SNAPSHOTS'

/** What the API gets as `image`: the name, or the id for snapshots and
 *  backups (they have no name). */
export const imageRef = (img: { id: number; name: string }) => img.name || String(img.id)

/** Most-used first; anything else follows alphabetically. */
const FLAVOR_ORDER = ['ubuntu', 'debian', 'rocky', 'alma', 'fedora', 'centos', 'opensuse']
const flavorRank = (f: string) => {
  const i = FLAVOR_ORDER.indexOf(f.toLowerCase())
  return i === -1 ? FLAVOR_ORDER.length : i
}
const FLAVOR_LABEL: Record<string, string> = { alma: 'AlmaLinux', rocky: 'Rocky', opensuse: 'openSUSE', centos: 'CentOS' }
const flavorLabel = (f: string) => FLAVOR_LABEL[f.toLowerCase()] ?? f.charAt(0).toUpperCase() + f.slice(1)

/** Sensible default: the newest release of the most-used OS (Ubuntu). */
export function defaultImage(images: Img[]): Img | undefined {
  const sys = images.filter((i) => i.type === 'system')
  return [...sys].sort(
    (a, b) =>
      flavorRank(a.osFlavor) - flavorRank(b.osFlavor) || byVersionDesc(a.osVersion || a.name, b.osVersion || b.name),
  )[0]
}

const tabOf = (img: Img): Tab => (img.type === 'system' ? 'SYSTEM' : img.type === 'app' ? 'APPS' : 'SNAPSHOTS')

/**
 * One image picker for New server and Rebuild. `images` must already be
 * filtered to the target architecture. SYSTEM = every OS at once (popular
 * first) + a version bar; APPS / SNAPSHOTS = one row per image.
 */
export function ImagePicker({
  images,
  value,
  onChange,
  desktop,
}: {
  images: Img[]
  value: string
  onChange: (ref: string) => void
  desktop: boolean
}) {
  const selected = images.find((i) => imageRef(i) === value)
  const [tab, setTab] = useState<Tab>(selected ? tabOf(selected) : 'SYSTEM')
  const inTab = useMemo(() => images.filter((i) => tabOf(i) === tab), [images, tab])

  const flavors = useMemo(() => {
    const map = new Map<string, Img[]>()
    for (const img of images.filter((i) => i.type === 'system')) {
      const list = map.get(img.osFlavor) ?? []
      list.push(img)
      map.set(img.osFlavor, list)
    }
    return [...map.entries()]
      .map(([flavor, list]) => ({ flavor, list: list.sort((a, b) => byVersionDesc(a.osVersion || a.name, b.osVersion || b.name)) }))
      .sort((a, b) => flavorRank(a.flavor) - flavorRank(b.flavor) || a.flavor.localeCompare(b.flavor))
  }, [images])

  const current = flavors.find((f) => f.list.some((i) => imageRef(i) === value))

  return (
    <div>
      <div className="grid1" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }} role="tablist" aria-label="Image kind">
        {(['SYSTEM', 'APPS', 'SNAPSHOTS'] as Tab[]).map((t) => {
          const on = t === tab
          const n = images.filter((i) => tabOf(i) === t).length
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={on}
              className="m"
              style={{ height: 40, textAlign: 'center', fontSize: 11, letterSpacing: '.1em', background: on ? 'var(--fg)' : 'var(--bg)', color: on ? 'var(--bg)' : 'var(--t2)' }}
              onClick={() => setTab(t)}
            >
              {t} <span style={{ opacity: 0.5 }}>{n}</span>
            </button>
          )
        })}
      </div>

      {tab === 'SYSTEM' && (
        <>
          <div role="radiogroup" aria-label="Operating system" style={{ display: 'grid', gridTemplateColumns: `repeat(${desktop ? 4 : 3}, minmax(0, 1fr))`, gap: 6, marginTop: 10 }}>
            {flavors.map((f) => {
              const on = current?.flavor === f.flavor
              const shown = on && selected ? selected : f.list[0]
              return (
                <button
                  key={f.flavor}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => onChange(imageRef(f.list[0]))}
                  style={{ position: 'relative', height: 60, padding: '10px 12px', border: `1px solid ${on ? 'var(--accent)' : 'var(--line2)'}`, background: on ? 'var(--accent-dim)' : 'var(--bg)', textAlign: 'left' }}
                >
                  {on && <span style={{ position: 'absolute', right: 0, top: 0, width: 10, height: 10, background: 'var(--accent)' }} />}
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{flavorLabel(f.flavor)}</span>
                  <span className="m" style={{ display: 'block', fontSize: 10.5, marginTop: 4, color: on ? 'var(--accent)' : 'var(--t3)' }}>
                    {shown.osVersion || shown.name}
                    {f.list.length > 1 && !on ? ` · +${f.list.length - 1}` : ''}
                  </span>
                </button>
              )
            })}
          </div>
          {current && current.list.length > 1 && (
            <div style={{ marginTop: 10 }}>
              <div className="eb" style={{ fontSize: 9.5, marginBottom: 6 }}>
                {flavorLabel(current.flavor)} version
              </div>
              <div className="grid1" role="radiogroup" aria-label="Version" style={{ gridTemplateColumns: `repeat(${Math.min(current.list.length, desktop ? 6 : 4)}, minmax(0, 1fr))` }}>
                {current.list.map((img) => {
                  const on = imageRef(img) === value
                  return (
                    <button
                      key={img.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className="num"
                      style={{ height: 40, textAlign: 'center', fontSize: 13, background: on ? 'var(--fg)' : 'var(--bg)', color: on ? 'var(--bg)' : 'var(--t2)' }}
                      onClick={() => onChange(imageRef(img))}
                    >
                      {img.osVersion || img.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {tab !== 'SYSTEM' && (
        // apps and snapshots use the same tiles as the OS grid
        <div role="radiogroup" aria-label={tab === 'APPS' ? 'App image' : 'Snapshot'} style={{ display: 'grid', gridTemplateColumns: `repeat(${desktop ? 4 : 2}, minmax(0, 1fr))`, gap: 6, marginTop: 10 }}>
          {inTab.map((img) => {
            const on = imageRef(img) === value
            const base = img.osFlavor ? `${flavorLabel(img.osFlavor)} ${img.osVersion}`.trim() : ''
            const sub = tab === 'APPS' ? base || img.name : [`#${img.id}`, base].filter(Boolean).join(' · ')
            return (
              <button
                key={img.id}
                type="button"
                role="radio"
                aria-checked={on}
                title={img.description || img.name}
                onClick={() => onChange(imageRef(img))}
                style={{ position: 'relative', height: 60, padding: '10px 12px', border: `1px solid ${on ? 'var(--accent)' : 'var(--line2)'}`, background: on ? 'var(--accent-dim)' : 'var(--bg)', textAlign: 'left', minWidth: 0 }}
              >
                {on && <span style={{ position: 'absolute', right: 0, top: 0, width: 10, height: 10, background: 'var(--accent)' }} />}
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {img.description || img.name || `#${img.id}`}
                </span>
                <span className="m" style={{ display: 'block', fontSize: 10.5, marginTop: 4, color: on ? 'var(--accent)' : 'var(--t3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {sub}
                </span>
              </button>
            )
          })}
          {inTab.length === 0 && (
            <p className="m t3" style={{ fontSize: 11, padding: '14px 2px', margin: 0, gridColumn: '1 / -1' }}>
              {tab === 'APPS' ? 'No app images for this architecture.' : 'No snapshots or backups for this architecture.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
