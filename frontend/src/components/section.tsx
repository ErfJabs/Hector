import { NavLink, useLocation } from 'react-router-dom'
import { useIsDesktop } from '../hooks'

/** The panel's nine sections, in four groups. `path` doubles as the route in
 *  App.tsx so navigation and routing can never drift apart. */
export interface SectionDef {
  group: string
  label: string
  path: string
  /** servers live at "/" but every other page also belongs to that section */
  match?: (pathname: string) => boolean
}

const prefix = (p: string) => (pathname: string) => pathname === p || pathname.startsWith(`${p}/`)

export const SECTIONS: SectionDef[] = [
  {
    group: 'Compute',
    label: 'Servers',
    path: '/',
    match: (p) => p === '/' || p.startsWith('/servers') || p === '/new',
  },
  { group: 'Compute', label: 'Storage', path: '/storage', match: prefix('/storage') },
  { group: 'Compute', label: 'Images', path: '/images', match: prefix('/images') },
  { group: 'Network', label: 'Network', path: '/network', match: prefix('/network') },
  { group: 'Network', label: 'Balancers', path: '/load-balancers', match: prefix('/load-balancers') },
  { group: 'Network', label: 'Addresses', path: '/addresses', match: prefix('/addresses') },
  { group: 'Platform', label: 'Access', path: '/access', match: prefix('/access') },
  { group: 'Platform', label: 'Placement', path: '/placement-groups', match: prefix('/placement-groups') },
  { group: 'System', label: 'Activity', path: '/activity', match: prefix('/activity') },
]

export interface SubTab {
  label: string
  path: string
  /** a section root that must not light up for its own children */
  end?: boolean
}

/** Grouped section rail: one row of links, groups split by hairlines. */
export function SectionNav() {
  const { pathname } = useLocation()
  const desktop = useIsDesktop()

  let group = ''
  const nodes: React.ReactNode[] = []
  SECTIONS.forEach((s, i) => {
    const newGroup = s.group !== group
    group = s.group
    const on = (s.match ?? prefix(s.path))(pathname)
    const link = (
      <NavLink
        key={s.path}
        to={s.path}
        className={on ? 'navlink navlink-on' : 'navlink'}
        aria-current={on ? 'page' : undefined}
      >
        {s.label}
      </NavLink>
    )
    if (newGroup) {
      nodes.push(
        <div className="navgroup" key={`${s.group}-${i}`}>
          {desktop && <span className="navtag">{s.group}</span>}
          {link}
        </div>,
      )
    } else {
      nodes.push(link)
    }
  })

  return (
    <nav className={desktop ? 'navbar hscroll' : 'navrail hscroll'} aria-label="Sections">
      {nodes}
    </nav>
  )
}

/** Sub-tabs for a section that has more than one collection. */
export function SubTabs({ tabs }: { tabs: SubTab[] }) {
  const { pathname } = useLocation()
  const desktop = useIsDesktop()
  return (
    <div
      className="hscroll"
      style={{
        display: 'flex',
        gap: 20,
        padding: desktop ? '0 40px' : '0 16px',
        borderBottom: '1px solid var(--line)',
      }}
    >
      {tabs.map((t) => {
        const on = t.end ? pathname === t.path : pathname === t.path || pathname.startsWith(`${t.path}/`)
        return (
          <NavLink
            key={t.path}
            to={t.path}
            className={on ? 'tab tab-on' : 'tab'}
            aria-current={on ? 'page' : undefined}
          >
            {t.label}
          </NavLink>
        )
      })}
    </div>
  )
}
