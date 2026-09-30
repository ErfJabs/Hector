import type { FleetItem } from './types'

// ---- numbers -----------------------------------------------------------

/** Bytes to TB (TiB math: Hetzner counts 2^40 and labels it TB: 20 TB included). */
export function tb(bytes: number): string {
  const v = bytes / 2 ** 40
  if (v === 0) return '0'
  if (v < 1) return v.toFixed(2)
  if (v < 100) return v.toFixed(1)
  return String(Math.round(v))
}

export function gb(bytes: number): string {
  return String(Math.round(bytes / 1e9))
}

export function euro(v: number, decimals = 2): string {
  return `€${v.toFixed(decimals)}`
}

export function pct(v: number): string {
  return `${Math.round(v)}%`
}

/** Fleet list privacy: keep only the first and last part of a public address
 *  (116.**.**.42 / 2a01:**:**:1) — the middle is hidden in the list only. */
export function maskIp(ip: string): string {
  if (!ip) return ip
  if (ip.includes(':')) {
    const g = ip.split(':')
    return g.length >= 3 ? `${g[0]}:**:**:${g[g.length - 1]}` : ip
  }
  const p = ip.split('.')
  return p.length === 4 ? `${p[0]}.**.**.${p[3]}` : ip
}

// ---- time --------------------------------------------------------------

/** "12 d ago" / "3 h ago" / "just now" — the lifecycle list format. */
export function ago(iso: string | null): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const s = Math.max(0, (Date.now() - then) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} m ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} d ago`
}

/** Compact form for desktop tables: "12 D". */
export function agoShort(iso: string | null): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const s = Math.max(0, (Date.now() - then) / 1000)
  if (s < 60) return `${Math.floor(s)} S`
  if (s < 3600) return `${Math.floor(s / 60)} M`
  if (s < 86400) return `${Math.floor(s / 3600)} H`
  return `${Math.floor(s / 86400)} D`
}

/** "12D 04H" — the header "on for" clock. */
export function uptime(iso: string | null): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const s = Math.max(0, (Date.now() - then) / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}D ${String(h).padStart(2, '0')}H`
  if (h > 0) return `${h}H ${String(m).padStart(2, '0')}M`
  return `${m}M`
}

/** Server age for headers: "200D" / "5H" / "12M". */
export function age(iso: string | null): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const s = Math.max(0, (Date.now() - then) / 1000)
  if (s >= 86400) return `${Math.floor(s / 86400)}D`
  if (s >= 3600) return `${Math.floor(s / 3600)}H`
  return `${Math.max(1, Math.floor(s / 60))}M`
}

export function duration(s: number): string {
  s = Math.max(0, Math.round(s))
  if (s < 60) return `${s} s`
  return `${Math.floor(s / 60)} m ${s % 60} s`
}

/** Hetzner server names are hostnames (RFC 1123): lowercase labels of
 *  letters/digits/dashes, dots between labels, max 63 chars in total. */
export function validServerName(name: string): boolean {
  return name.length <= 63 && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(name)
}

/** Make any typed text a valid server name as you type: lowercase, spaces
 *  and underscores → dashes, other characters dropped. Friendlier than
 *  rejecting "Web Server" — it becomes "web-server". */
export function toServerName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9.-]/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 63)
}

const ADJ = ['calm', 'swift', 'bold', 'quiet', 'brave', 'sharp', 'solid', 'bright', 'north', 'lunar', 'rapid', 'still']
const NOUN = ['falcon', 'harbor', 'cedar', 'comet', 'ridge', 'atlas', 'ember', 'delta', 'orbit', 'summit', 'pine', 'forge']
/** "swift-cedar-42" — for when the name doesn't matter. */
export function randomServerName(): string {
  const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)]
  return `${pick(ADJ)}-${pick(NOUN)}-${Math.floor(10 + Math.random() * 90)}`
}

/** Numeric-aware version sort, newest first ("10" before "9"). */
export function byVersionDesc(a: string, b: string): number {
  return b.localeCompare(a, undefined, { numeric: true })
}

// ---- status ------------------------------------------------------------

export interface StatusShape {
  sq: string
  label: string
  tone: string
  running: boolean
  busy: boolean
  off: boolean
}

const MOTION = new Set(['initializing', 'starting', 'stopping', 'rebuilding', 'migrating', 'deleting'])

/** shape first, then color (foundations: status section). */
export function statusShape(status: string): StatusShape {
  if (status === 'running') {
    return { sq: 'sq sq-run', label: 'Running', tone: 'color: var(--run)', running: true, busy: false, off: false }
  }
  if (status === 'off') {
    return { sq: 'sq sq-off', label: 'Off', tone: 'color: var(--t3)', running: false, busy: false, off: true }
  }
  if (MOTION.has(status)) {
    return {
      sq: 'sq sq-move',
      label: status.charAt(0).toUpperCase() + status.slice(1),
      tone: 'color: var(--move)',
      running: false,
      busy: true,
      off: false,
    }
  }
  return { sq: 'sq sq-unk', label: 'Unknown', tone: 'color: var(--t3)', running: false, busy: false, off: false }
}

export interface Flag {
  label: string
  cls: string
}

/** The tags under a server name (list cards, desktop rows). */
export function flags(item: FleetItem): Flag[] {
  const out: Flag[] = []
  const traffic = item.traffic.includedBytes > 0 ? item.traffic.outBytes / item.traffic.includedBytes : 0
  if (item.locked) out.push({ label: 'Locked', cls: 'tag tag-move' })
  if (item.rescue) out.push({ label: 'Rescue on', cls: 'tag tag-warn' })
  if (item.iso) out.push({ label: 'ISO', cls: 'tag tag-warn' })
  if (item.protectDelete || item.protectRebuild) out.push({ label: 'Protected', cls: 'tag' })
  if (item.backups) out.push({ label: 'Backups', cls: 'tag' })
  if (traffic >= 0.8) out.push({ label: `Traffic ${Math.round(traffic * 100)}%`, cls: 'tag tag-warn' })
  return out
}

/** "CPX22 · FSN1 · UBUNTU 24.04" */
export function metaLine(item: FleetItem): string {
  return `${item.type.name} · ${item.location.code} · ${item.image}`.toUpperCase()
}

export function specLine(item: FleetItem): string {
  return `${item.type.cores} vCPU · ${item.type.memoryGb} GB · ${item.type.diskGb} GB`
}

export function trafficColor(item: FleetItem): string {
  const frac = item.traffic.includedBytes > 0 ? item.traffic.outBytes / item.traffic.includedBytes : 0
  return frac >= 0.8 ? 'color: var(--warn)' : ''
}

/** Command name → human gerund for toasts: "reboot_server" → "Rebooting". */
export function commandTitle(command: string): string {
  const map: Record<string, string> = {
    start_server: 'Starting',
    stop_server: 'Powering off',
    shutdown_server: 'Shutting down',
    reboot_server: 'Rebooting',
    reset_server: 'Resetting',
    create_image: 'Creating snapshot',
    change_type: 'Rescaling',
    enable_rescue: 'Enabling rescue mode',
    disable_rescue: 'Disabling rescue mode',
    reset_password: 'Resetting root password',
    attach_iso: 'Mounting ISO',
    detach_iso: 'Unmounting ISO',
    enable_backup: 'Enabling backups',
    disable_backup: 'Disabling backups',
    change_protection: 'Updating protection',
    change_dns_ptr: 'Updating reverse DNS',
    create_server: 'Building',
  }
  return map[command] ?? command
}

/** Past-tense label for the lifecycle list: "reboot_server" → "Reboot". */
export function commandLabel(command: string): string {
  const map: Record<string, string> = {
    create_server: 'Create server',
    start_server: 'Start',
    stop_server: 'Power off',
    shutdown_server: 'Shut down',
    reboot_server: 'Reboot',
    reset_server: 'Reset',
    change_type: 'Change type',
    change_dns_ptr: 'Change reverse DNS',
    enable_rescue: 'Enable rescue mode',
    disable_rescue: 'Disable rescue mode',
    reset_password: 'Reset root password',
    attach_iso: 'Mount ISO',
    detach_iso: 'Unmount ISO',
    enable_backup: 'Enable backups',
    disable_backup: 'Disable backups',
    create_image: 'Create snapshot',
    change_protection: 'Change protection',
    rebuild_server: 'Rebuild',
    delete_server: 'Delete server',
  }
  return map[command] ?? command
}

/** CPU sparkline for the detail header: 60 points → 24 columns. */
export function downsample(series: number[], n: number): number[] {
  if (series.length <= n) return series
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    out.push(series[Math.round((i * (series.length - 1)) / (n - 1))])
  }
  return out
}

/** "1.2k" for pps values. */
export function compact(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`
  if (v >= 10) return String(Math.round(v))
  return v.toFixed(1)
}

/** Server type prefix → the human performance class ("REGULAR PERF."). */
export function perfClass(category: string, typeName: string): string {
  const c = (category || '').toLowerCase()
  if (c.includes('cost')) return 'COST-OPT.'
  if (c.includes('dedicated')) return 'DEDICATED'
  if (c.includes('regular')) return 'REGULAR PERF.'
  const n = typeName.toLowerCase()
  if (n.startsWith('ccx')) return 'DEDICATED'
  if (n.startsWith('cpx')) return 'REGULAR PERF.'
  if (n.startsWith('cax') || n.startsWith('cx')) return 'COST-OPT.'
  return ''
}

export type Tier = 'REGULAR' | 'COST-OPT.' | 'DEDICATED'

/** Server type → tier tab, category first with a name-prefix fallback. */
export function tierOf(t: { name: string; category?: string }): Tier | null {
  const c = (t.category || '').toLowerCase()
  if (c.includes('cost')) return 'COST-OPT.'
  if (c.includes('dedicated')) return 'DEDICATED'
  if (c.includes('regular')) return 'REGULAR'
  const n = t.name.toLowerCase()
  if (n.startsWith('cpx')) return 'REGULAR'
  if (n.startsWith('cax') || n.startsWith('cx')) return 'COST-OPT.'
  if (n.startsWith('ccx')) return 'DEDICATED'
  return null
}

/** Server type prefix → the human performance class ("REGULAR PERF."). */
export function storageLabel(storage: string): string {
  return storage === 'local' ? 'LOCAL NVMe' : storage === 'network' ? 'NETWORK SSD' : storage.toUpperCase()
}
