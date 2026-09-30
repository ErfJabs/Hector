// JSON contract — mirrors backend/types/types.go.

export interface FleetSummary {
  total: number
  running: number
  vcpu: number
  memoryGb: number
  diskGb: number
  outBytes: number
  /** sum of known prices (legacy servers at their pre-2026-06-15 price) */
  monthly: number
  /** servers whose price is unknown, not in `monthly` */
  legacy: number
}

export interface Fleet {
  servers: FleetItem[]
  summary: FleetSummary
  currency: string
  fetchedAt: string
}

export interface Busy {
  command: string
  progress: number
}

export interface TypeInfo {
  name: string
  cores: number
  memoryGb: number
  diskGb: number
  cpuType: string
  arch: string
  storage: string
  category: string
  deprecated: boolean
}

export interface LocationInfo {
  code: string
  city: string
  country: string
  zone: string
}

export interface CPUInfo {
  now: number
  series: number[]
}

export interface TrafficInfo {
  outBytes: number
  inBytes: number
  includedBytes: number
}

export interface FleetItem {
  id: number
  name: string
  status: string
  busy: Busy | null
  type: TypeInfo
  location: LocationInfo
  image: string
  ipv4: string
  ipv6: string
  cpu: CPUInfo | null
  traffic: TrafficInfo
  price: number
  locked: boolean
  rescue: boolean
  iso: boolean
  backups: boolean
  protectDelete: boolean
  protectRebuild: boolean
  ipBlocked: boolean
  created: string
  /** ordered before Hetzner's 2026-06-15 price change: billed at an old
   *  price the API doesn't expose — `price` is only today's list price */
  legacyPrice: boolean
  /** legacy server whose old price isn't in the backend table */
  priceUnknown: boolean
}

export interface ActionInfo {
  id: number
  command: string
  status: string
  progress: number
  started: string
  finished: string | null
  durationS: number
  errorCode: string
  errorMessage: string
}

export interface RDNSRow {
  family: string
  ip: string
  dnsPtr: string
}

export interface ServerDetail extends FleetItem {
  datacenter: string
  onSince: string | null
  rdns: RDNSRow[]
  actions: ActionInfo[]
  actionsTotal: number
}

export interface ActionResult {
  action: ActionInfo
  rootPassword: string
}

/** Detail-only parts served with the metrics so opening a server costs one
 *  request: the fleet list already carries the base item. */
export interface MetricsExtras {
  item: FleetItem
  rdns: RDNSRow[]
  actions: ActionInfo[]
  actionsTotal: number
  onSince: string | null
}

export interface MetricsView {
  range: string
  step: number
  cpu: { now: number; avg: number; peak: number; series: number[] }
  disk: { read: number[]; write: number[]; iopsRead: number; iopsWrite: number }
  net: { in: number[]; out: number[]; ppsIn: number; ppsOut: number }
  extras?: MetricsExtras | null
}

export interface TypePrice {
  monthly: number
  hourly: number
  includedGb: number
  available: boolean
}

export interface CatalogServerType {
  id: number
  name: string
  cores: number
  memoryGb: number
  diskGb: number
  storage: string
  cpuType: string
  arch: string
  category: string
  deprecated: boolean
  prices: Record<string, TypePrice>
}

export interface Catalog {
  currency: string
  vatRate: string
  backupPercent: string
  locations: { code: string; name: string; city: string; country: string; zone: string }[]
  images: { id: number; name: string; description: string; type: string; osFlavor: string; osVersion: string; arch: string }[]
  serverTypes: CatalogServerType[]
  sshKeys: { id: number; name: string; fingerprint: string }[]
  isos: { id: number; name: string; description: string; type: string; arch: string }[]
}

export interface CreateRequest {
  name: string
  type: string
  image: string
  location: string
  sshKeys: number[]
  userData: string
  startAfterCreate: boolean
  backups: boolean
  enableIpv4: boolean
  enableIpv6: boolean
}

export interface CreateResult {
  server: FleetItem
  action: ActionInfo
  nextActions: ActionInfo[]
  rootPassword: string
}

export interface JobStep {
  key: string
  status: string
  progress: number
  error: string
}

export interface Job {
  id: string
  serverId: number
  kind: string
  status: string
  steps: JobStep[]
  error: string
}
