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
  /** several rows when the endpoint returns a list (firewall rules) */
  actions: ActionInfo[]
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

// ---- resource sections (mirror backend/types/resources.go) -------------

export interface Volume {
  id: number
  name: string
  sizeGb: number
  status: string
  location: LocationInfo
  serverId: number | null
  device: string
  format: string
  labels: Record<string, string>
  protectDelete: boolean
  created: string
}

export interface NetworkSubnet {
  type: string
  ipRange: string
  networkZone: string
  gateway: string
}

export interface NetworkRoute {
  destination: string
  gateway: string
}

export interface Network {
  id: number
  name: string
  ipRange: string
  subnets: NetworkSubnet[]
  routes: NetworkRoute[]
  servers: number[]
  loadBalancers: number[]
  labels: Record<string, string>
  exposeSwitch: boolean
  protectDelete: boolean
  created: string
}

export interface NetworkMember {
  type: string
  id: number
  ip: string
  status: string
  aliasIps: string[]
  subnet: string
}

export interface FirewallRule {
  direction: string
  protocol: string
  port: string
  sources: string[]
  destinations: string[]
  description: string
}

export interface FirewallTarget {
  type: string
  serverId: number
  selector: string
}

export interface Firewall {
  id: number
  name: string
  rules: FirewallRule[]
  appliedTo: FirewallTarget[]
  labels: Record<string, string>
  created: string
}

export interface IPDNSEntry {
  ip: string
  dnsPtr: string
}

export interface FloatingIP {
  id: number
  name: string
  ip: string
  type: string
  serverId: number | null
  description: string
  location: LocationInfo
  dns: IPDNSEntry[]
  blocked: boolean
  protectDelete: boolean
  labels: Record<string, string>
  created: string
}

export interface PrimaryIP {
  id: number
  name: string
  ip: string
  type: string
  assigneeId: number | null
  assigneeType: string
  autoDelete: boolean
  location: LocationInfo
  dns: IPDNSEntry[]
  blocked: boolean
  protectDelete: boolean
  labels: Record<string, string>
  created: string
}

export interface LBHealth {
  listenPort: number
  status: string
}

export interface LBService {
  protocol: string
  listenPort: number
  destinationPort: number
  proxyProtocol: boolean
  certificates: number[]
  redirectHttp: boolean
  stickySessions: boolean
}

export interface LBTarget {
  type: string
  serverId: number
  selector: string
  ip: string
  usePrivateIP: boolean
  healthStatus: LBHealth[]
}

export interface LoadBalancer {
  id: number
  name: string
  type: string
  location: LocationInfo
  algorithm: string
  ipv4: string
  ipv6: string
  publicEnabled: boolean
  services: LBService[]
  targets: LBTarget[]
  labels: Record<string, string>
  protectDelete: boolean
  created: string
  actions: ActionInfo[]
  actionsTotal: number
}

export interface PlacementGroup {
  id: number
  name: string
  type: string
  serverIds: number[]
  labels: Record<string, string>
  created: string
}

export interface CertificateUsedBy {
  id: number
  type: string
}

export interface Certificate {
  id: number
  name: string
  type: string
  domainNames: string[]
  fingerprint: string
  notValidBefore: string
  notValidAfter: string
  issuance: string
  renewal: string
  issuanceError: string
  usedBy: CertificateUsedBy[]
  labels: Record<string, string>
  created: string
}

export interface SSHKey {
  id: number
  name: string
  fingerprint: string
  publicKey: string
  labels: Record<string, string>
  created: string
}

export interface Image {
  id: number
  name: string
  description: string
  type: string
  status: string
  osFlavor: string
  osVersion: string
  arch: string
  sizeGb: number
  diskGb: number
  boundTo: number | null
  rapidDeploy: boolean
  labels: Record<string, string>
  protectDelete: boolean
  deprecated: string | null
  created: string | null
}

export interface Activity {
  actions: ActionInfo[]
  running: ActionInfo[]
  total: number
}
