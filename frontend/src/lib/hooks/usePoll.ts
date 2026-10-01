// src/lib/hooks/usePoll.ts
//
// Small polling data hook used by the command-centre pages. Fetches through
// the Next.js proxy (never the backend directly), keeps the last good value
// while a refresh is in flight, and reports how stale it is.
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface PollState<T> {
  data: T | null
  error: string | null
  loading: boolean
  /** epoch ms of the last successful fetch */
  updatedAt: number | null
  refresh: () => void
}

export function usePoll<T>(url: string | null, intervalMs = 15000): PollState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!!url)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const alive = useRef(true)

  const load = useCallback(async () => {
    if (!url) return
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error(`${res.status}`)
      const json = (await res.json()) as T
      if (!alive.current) return
      setData(json)
      setError(null)
      setUpdatedAt(Date.now())
    } catch (e) {
      if (!alive.current) return
      setError(e instanceof Error ? e.message : 'failed')
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [url])

  useEffect(() => {
    alive.current = true
    setLoading(!!url)
    load()
    if (!url || intervalMs <= 0) return () => { alive.current = false }
    const t = setInterval(load, intervalMs)
    return () => {
      alive.current = false
      clearInterval(t)
    }
  }, [url, intervalMs, load])

  return { data, error, loading, updatedAt, refresh: load }
}

/** Fetches several URLs in parallel and returns their results by key. */
export function useBackend<T>(path: string | null, intervalMs = 15000): PollState<T> {
  return usePoll<T>(path ? `/api/backend/${path}` : null, intervalMs)
}
