import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, cache } from './api'

/** Reactive media query. Desktop layout kicks in at 1100px (the design's
 *  table needs the room; below that the mobile cards are the design). */
export function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 1100px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1100px)')
    const onChange = () => setDesktop(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return desktop
}

export interface AsyncState<T> {
  data: T | null
  error: ApiError | null
  loading: boolean
  reload: (quiet?: boolean) => void
}

/**
 * useAsync runs `fn` on mount and whenever `deps` (or `skip`) change;
 * `pollMs` adds a background refresh (paused while the tab is hidden).
 *
 * Every run gets a generation number; only the latest run may write state.
 * That drops stale responses (a slow 30D metrics answer arriving after 1H)
 * and survives StrictMode's mount → unmount → mount in dev.
 */
export function useAsync<T>(
  fn: () => Promise<T>,
  deps: unknown[],
  opts: { pollMs?: number; skip?: boolean; cache?: { key: string; ttlMs: number } } = {},
): AsyncState<T> {
  // With `cache`: a cached value renders at once; younger than ttlMs it is
  // used as-is, older it is shown while a quiet refetch runs.
  const key = opts.cache?.key
  const ttl = opts.cache?.ttlMs ?? 0
  const [data, setData] = useState<T | null>(() => (key ? (cache.peek<T>(key) ?? null) : null))
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(!opts.skip && !(key && cache.peek(key) !== undefined))
  const keyRef = useRef(key)
  keyRef.current = key

  const fnRef = useRef(fn)
  fnRef.current = fn
  const gen = useRef(0)
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // One run at a time: with a backend slower than the poll interval (a dead
  // proxy burned 20 s per fleet call against a 15 s poll) every run was
  // superseded by the next poll before it settled — spinner forever, errors
  // swallowed. Overlapping calls now queue and start when the one in flight
  // finishes, so each completion can actually write data/error/loading.
  const inFlight = useRef(false)
  const queued = useRef(false)
  const queuedQuiet = useRef(true)

  const run = useCallback(async (quiet: boolean) => {
    if (inFlight.current) {
      queued.current = true
      queuedQuiet.current = queuedQuiet.current && quiet
      return
    }
    inFlight.current = true
    const my = ++gen.current
    const current = () => mounted.current && my === gen.current
    if (!quiet) setLoading(true)
    try {
      const result = await fnRef.current()
      if (my === gen.current && keyRef.current) cache.set(keyRef.current, result)
      if (current()) {
        setData(result)
        setError(null)
      }
    } catch (err) {
      if (current()) setError(err instanceof ApiError ? err : new ApiError(0, '', String(err)))
    } finally {
      inFlight.current = false
      if (current()) setLoading(false)
      if (queued.current) {
        const q = queuedQuiet.current
        queued.current = false
        queuedQuiet.current = true
        void run(q)
      }
    }
  }, [])

  useEffect(() => {
    if (opts.skip) return
    const fresh = key ? cache.get<T>(key, ttl) : undefined
    const stale = key ? cache.peek<T>(key) : undefined
    if (fresh !== undefined) {
      setData(fresh)
      setError(null)
      setLoading(false)
    } else if (stale !== undefined) {
      setData(stale)
      void run(true)
    } else {
      void run(false)
    }
    let timer: number | undefined
    if (opts.pollMs) {
      timer = window.setInterval(() => {
        if (document.visibilityState === 'visible') void run(true)
      }, opts.pollMs)
    }
    return () => {
      gen.current++ // invalidate whatever is still in flight for the old deps
      if (timer) window.clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, opts.skip, opts.pollMs, key])

  const reload = useCallback((quiet = false) => void run(quiet), [run])
  return { data, error, loading, reload }
}

/** Run `onChange` whenever notifyChanged() fires (any server mutation). */
export function useOnChanged(onChange: () => void) {
  const ref = useRef(onChange)
  ref.current = onChange
  useEffect(() => {
    const h = () => ref.current()
    window.addEventListener('hector:changed', h)
    return () => window.removeEventListener('hector:changed', h)
  }, [])
}

/** Copy text; works on plain-http deployments where navigator.clipboard is
 *  undefined (it only exists in secure contexts). Resolves false on failure. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through to the legacy path */
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  document.body.removeChild(ta)
  return ok
}
