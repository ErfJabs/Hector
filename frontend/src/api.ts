import type {
  Activity, ActionResult, Certificate, Catalog, CreateRequest, CreateResult, Fleet, FloatingIP,
  Firewall, Image, Job, LoadBalancer, MetricsView, Network, PlacementGroup, PrimaryIP, ServerDetail,
  SSHKey, Volume,
} from './types'

const TOKEN_KEY = 'hector.token'

// ---- client cache + change bus ------------------------------------------
// Small in-memory cache so moving between screens doesn't refetch the same
// data (catalog for minutes, fleet/detail for seconds — stale data is shown
// at once and revalidated). Any mutation calls notifyChanged(): caches drop
// and open screens reload, so the list and the detail stay in sync.

const store = new Map<string, { at: number; value: unknown }>()
let fleetDirty = false

export const cache = {
  /** value younger than maxAgeMs, else undefined */
  get<T>(key: string, maxAgeMs: number): T | undefined {
    const hit = store.get(key)
    return hit && Date.now() - hit.at < maxAgeMs ? (hit.value as T) : undefined
  },
  /** any cached value, however old (for instant display while revalidating) */
  peek<T>(key: string): T | undefined {
    return store.get(key)?.value as T | undefined
  },
  set(key: string, value: unknown) {
    store.set(key, { at: Date.now(), value })
  },
  /** expire keys starting with prefix (kept for instant display) */
  expire(prefix: string) {
    for (const [k, v] of store) if (k.startsWith(prefix)) v.at = 0
  },
}

/** The catalog changes rarely: one fetch serves every screen for 10 min. */
export const CATALOG_CACHE = { key: 'catalog', ttlMs: 10 * 60 * 1000 }

/** A server changed (action sent/settled, rename, create, delete). */
export function notifyChanged() {
  fleetDirty = true
  cache.expire('fleet')
  cache.expire('server:')
  cache.expire('snapshots:')
  window.dispatchEvent(new Event('hector:changed'))
}

/** A resource outside the fleet changed (volume, firewall, key...): drop its
 *  cached list and tell open screens to reload — but never force the fleet
 *  to rebuild, which would cost 1 + N Hetzner requests. */
export function notifyResource(prefix: string) {
  cache.expire(prefix)
  window.dispatchEvent(new Event('hector:changed'))
}

/** true once after notifyChanged(): the next fleet read must bypass the
 *  backend's 25 s cache too. */
export function takeFleetDirty(): boolean {
  const d = fleetDirty
  fleetDirty = false
  return d
}

export const session = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

/** ApiError carries the backend `code` so screens can switch on it:
 *  session | unauthorized | token_missing | proxy | unreachable | ... */
export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  const token = session.get()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'unreachable', 'The panel did not answer.')
  }

  const text = await res.text()
  let data: { message?: string; code?: string } | null = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    // A reverse proxy's HTML error page (502/504) is not JSON — keep the status.
    if (res.ok) throw new ApiError(res.status, 'bad_response', 'The panel sent an unreadable response.')
  }

  if (!res.ok) {
    const code = data?.code ?? ''
    if (res.status === 401 && code === 'session') {
      window.dispatchEvent(new Event('hector:session-expired'))
    }
    throw new ApiError(res.status, code, data?.message ?? res.statusText)
  }
  return data as T
}

/** A new server has no samples yet; older backends sent null series (the
 *  metrics screen crashed to black on it). Always hand screens arrays. */
function normalizeMetrics(m: MetricsView): MetricsView {
  const arr = (v: number[] | null | undefined) => (Array.isArray(v) ? v : [])
  return {
    ...m,
    cpu: { now: m.cpu?.now ?? 0, avg: m.cpu?.avg ?? 0, peak: m.cpu?.peak ?? 0, series: arr(m.cpu?.series) },
    disk: { ...m.disk, read: arr(m.disk?.read), write: arr(m.disk?.write), iopsRead: m.disk?.iopsRead ?? 0, iopsWrite: m.disk?.iopsWrite ?? 0 },
    net: { ...m.net, in: arr(m.net?.in), out: arr(m.net?.out), ppsIn: m.net?.ppsIn ?? 0, ppsOut: m.net?.ppsOut ?? 0 },
  }
}

export const API = {
  login: (username: string, password: string) =>
    api<{ token: string }>('POST', '/api/auth/login', { username, password }),

  fleet: (fresh = false) => api<Fleet>('GET', `/api/fleet${fresh ? '?fresh=1' : ''}`),

  catalog: () =>
    api<Catalog>('GET', '/api/catalog').then((c) => ({
      // a fresh Hetzner account answers with null for empty collections —
      // the screens map over these, so hand them arrays (like normalizeMetrics)
      ...c,
      locations: c.locations ?? [],
      images: c.images ?? [],
      serverTypes: c.serverTypes ?? [],
      sshKeys: c.sshKeys ?? [],
      isos: c.isos ?? [],
    })),

  server: (id: number) => api<ServerDetail>('GET', `/api/servers/${id}`),
  rename: (id: number, name: string) => api<ServerDetail>('PUT', `/api/servers/${id}`, { name }),
  remove: (id: number) => api<{ action: ActionResult['action'] }>('DELETE', `/api/servers/${id}`),

  create: (req: CreateRequest) => api<CreateResult>('POST', '/api/servers', req),

  metrics: (id: number, range: string) =>
    api<MetricsView>('GET', `/api/servers/${id}/metrics?range=${range}`).then(normalizeMetrics),

  snapshots: (id: number) => api<{ count: number; sizeGb: number }>('GET', `/api/servers/${id}/snapshots`),

  action: (id: number, name: string, payload?: unknown) =>
    api<ActionResult>('POST', `/api/servers/${id}/actions/${name}`, payload ?? {}),

  actionGet: (id: number) => api<ActionResult['action']>('GET', `/api/actions/${id}`),

  rescale: (id: number, serverType: string, upgradeDisk: boolean) =>
    api<Job>('POST', `/api/servers/${id}/rescale`, { serverType, upgradeDisk }),

  job: (id: number) => api<Job | null>('GET', `/api/servers/${id}/job`),
}

// ---- resource sections -------------------------------------------------
//
// Every collection follows the same shape: a list read, a create, a rename/
// relabel PUT, a DELETE and a POST to /{collection}/{id}/actions/{action}.
// The action endpoints answer with ActionResult so the shared toast tracker
// can follow them — including the multi-row firewall answers, which put every
// row in `actions`.

export const Volumes = {
  list: () => api<Volume[]>('GET', '/api/volumes'),
  get: (id: number) => api<Volume>('GET', `/api/volumes/${id}`),
  create: (body: unknown) =>
    api<{ volume: Volume; action: ActionResult }>('POST', '/api/volumes', body),
  update: (id: number, body: unknown) => api<Volume>('PUT', `/api/volumes/${id}`, body),
  remove: (id: number) => api<ActionResult>('DELETE', `/api/volumes/${id}`),
  act: (id: number, action: string, body?: unknown) =>
    api<ActionResult>('POST', `/api/volumes/${id}/actions/${action}`, body ?? {}),
}

export const Networks = {
  list: () => api<Network[]>('GET', '/api/networks'),
  get: (id: number) =>
    api<{ network: Network; members: unknown[] }>('GET', `/api/networks/${id}`),
  create: (body: unknown) =>
    api<{ network: Network }>('POST', '/api/networks', body),
  update: (id: number, body: unknown) => api<Network>('PUT', `/api/networks/${id}`, body),
  remove: (id: number) => api<ActionResult>('DELETE', `/api/networks/${id}`),
  act: (id: number, action: string, body?: unknown) =>
    api<ActionResult>('POST', `/api/networks/${id}/actions/${action}`, body ?? {}),
}

export const Firewalls = {
  list: () => api<Firewall[]>('GET', '/api/firewalls'),
  get: (id: number) => api<Firewall>('GET', `/api/firewalls/${id}`),
  create: (body: unknown) =>
    api<{ firewall: Firewall; action: ActionResult }>('POST', '/api/firewalls', body),
  update: (id: number, body: unknown) => api<Firewall>('PUT', `/api/firewalls/${id}`, body),
  remove: (id: number) => api<void>('DELETE', `/api/firewalls/${id}`),
  act: (id: number, action: string, body?: unknown) =>
    api<ActionResult>('POST', `/api/firewalls/${id}/actions/${action}`, body ?? {}),
}

export const FloatingIPs = {
  list: () => api<FloatingIP[]>('GET', '/api/floating-ips'),
  get: (id: number) => api<FloatingIP>('GET', `/api/floating-ips/${id}`),
  create: (body: unknown) =>
    api<{ floatingIp: FloatingIP; action: ActionResult }>('POST', '/api/floating-ips', body),
  update: (id: number, body: unknown) => api<FloatingIP>('PUT', `/api/floating-ips/${id}`, body),
  remove: (id: number) => api<ActionResult>('DELETE', `/api/floating-ips/${id}`),
  act: (id: number, action: string, body?: unknown) =>
    api<ActionResult>('POST', `/api/floating-ips/${id}/actions/${action}`, body ?? {}),
}

export const PrimaryIPs = {
  list: () => api<PrimaryIP[]>('GET', '/api/primary-ips'),
  get: (id: number) => api<PrimaryIP>('GET', `/api/primary-ips/${id}`),
  create: (body: unknown) =>
    api<{ primaryIp: PrimaryIP; action: ActionResult }>('POST', '/api/primary-ips', body),
  update: (id: number, body: unknown) => api<PrimaryIP>('PUT', `/api/primary-ips/${id}`, body),
  remove: (id: number) => api<ActionResult>('DELETE', `/api/primary-ips/${id}`),
  act: (id: number, action: string, body?: unknown) =>
    api<ActionResult>('POST', `/api/primary-ips/${id}/actions/${action}`, body ?? {}),
}

export const LoadBalancers = {
  list: () => api<LoadBalancer[]>('GET', '/api/load-balancers'),
  get: (id: number) => api<LoadBalancer>('GET', `/api/load-balancers/${id}`),
  create: (body: unknown) =>
    api<{ loadBalancer: LoadBalancer; action: ActionResult }>('POST', '/api/load-balancers', body),
  update: (id: number, body: unknown) => api<LoadBalancer>('PUT', `/api/load-balancers/${id}`, body),
  remove: (id: number) => api<ActionResult>('DELETE', `/api/load-balancers/${id}`),
  act: (id: number, action: string, body?: unknown) =>
    api<ActionResult>('POST', `/api/load-balancers/${id}/actions/${action}`, body ?? {}),
}

export const PlacementGroups = {
  list: () => api<PlacementGroup[]>('GET', '/api/placement-groups'),
  create: (body: unknown) => api<{ placementGroup: PlacementGroup }>('POST', '/api/placement-groups', body),
  update: (id: number, body: unknown) => api<PlacementGroup>('PUT', `/api/placement-groups/${id}`, body),
  remove: (id: number) => api<void>('DELETE', `/api/placement-groups/${id}`),
}

export const Certificates = {
  list: () => api<Certificate[]>('GET', '/api/certificates'),
  create: (body: unknown) =>
    api<{ certificate: Certificate; action: ActionResult }>('POST', '/api/certificates', body),
  update: (id: number, body: unknown) => api<Certificate>('PUT', `/api/certificates/${id}`, body),
  remove: (id: number) => api<void>('DELETE', `/api/certificates/${id}`),
  retry: (id: number) => api<ActionResult>('POST', `/api/certificates/${id}/retry`),
}

export const SSHKeys = {
  list: () => api<SSHKey[]>('GET', '/api/ssh-keys'),
  create: (body: unknown) => api<{ sshKey: SSHKey }>('POST', '/api/ssh-keys', body),
  update: (id: number, body: unknown) => api<SSHKey>('PUT', `/api/ssh-keys/${id}`, body),
  remove: (id: number) => api<void>('DELETE', `/api/ssh-keys/${id}`),
}

export interface ImageQuery {
  type?: string
  status?: string
  name?: string
  arch?: string
}

export const Images = {
  list: (q: ImageQuery = {}) => {
    const params = new URLSearchParams()
    if (q.type) params.set('type', q.type)
    if (q.status) params.set('status', q.status)
    if (q.name) params.set('name', q.name)
    if (q.arch) params.set('arch', q.arch)
    const qs = params.toString()
    return api<Image[]>('GET', `/api/images${qs ? `?${qs}` : ''}`)
  },
  update: (id: number, body: unknown) => api<Image>('PUT', `/api/images/${id}`, body),
  remove: (id: number) => api<void>('DELETE', `/api/images/${id}`),
  act: (id: number, action: string, body?: unknown) =>
    api<ActionResult>('POST', `/api/images/${id}/actions/${action}`, body ?? {}),
}

export const ActivityFeed = {
  get: () => api<Activity>('GET', '/api/activity'),
}
