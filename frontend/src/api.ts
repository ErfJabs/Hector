import type {
  ActionResult, Catalog, CreateRequest, CreateResult, Fleet, Job, MetricsView, ServerDetail,
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
