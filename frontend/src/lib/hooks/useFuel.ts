// src/lib/hooks/useFuel.ts
//
// Fuel endurance derived straight from the station's tank-level telemetry
// (level_l series), not from a hand-typed inventory number: total litres on
// hand, burn rate fitted from the last 24 h of hourly means, days of endurance,
// and the margin against the days of isolation still ahead. Tagged "derived"
// in the UI so nobody mistakes it for a measured quantity.
'use client'

import { useEffect, useState } from 'react'
import { naiveUtc } from '@/lib/format'

interface SeriesRow {
  key: string
  asset_id: string
  station_id: string
  label: string
  unit: string
}
interface Latest {
  [key: string]: { value: number; ts: string; source: string } | null
}
interface Bucket {
  ts: string
  value: number
}

export interface TankStat {
  key: string
  asset_id: string
  litres: number
  isStore: boolean
  burnLph: number
  spark: number[]
}

export interface FuelState {
  loading: boolean
  error: string | null
  totalL: number
  burnLph: number
  days: number | null
  tanks: TankStat[]
  /** day tanks whose burn rate was measured from their own history (the rest are extrapolated) */
  measuredTanks: number
  /** hourly total litres, oldest first */
  history: { t: number; litres: number }[]
  updatedAt: number | null
}

const EMPTY: FuelState = { loading: true, error: null, totalL: 0, burnLph: 0, days: null, tanks: [], measuredTanks: 0, history: [], updatedAt: null }

const isFuelTank = (s: SeriesRow) => s.label === 'level_l' && /fuel-tank|safety-buffer|cache|ship-transfer/.test(s.asset_id)

// Theil–Sen slope (median of pairwise slopes) in litres per hour — robust to the
// odd outlier reading, which an ordinary least-squares fit is not.
function slope(points: { h: number; v: number }[]): number {
  const n = points.length
  if (n < 3) return 0
  const slopes: number[] = []
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dh = points[j].h - points[i].h
      if (dh > 0.2) slopes.push((points[j].v - points[i].v) / dh)
    }
  }
  if (!slopes.length) return 0
  slopes.sort((a, b) => a - b)
  return slopes[Math.floor(slopes.length / 2)]
}

export function useFuelEndurance(station: string, pollMs = 30000): FuelState {
  const [state, setState] = useState<FuelState>(EMPTY)

  useEffect(() => {
    let alive = true
    const get = async <T,>(path: string): Promise<T> => {
      const r = await fetch(`/api/backend/${path}`, { cache: 'no-store' })
      if (!r.ok) throw new Error(String(r.status))
      return r.json() as Promise<T>
    }

    async function run() {
      try {
        const series = (await get<SeriesRow[]>('series')).filter((s) => s.station_id === station && isFuelTank(s))
        if (series.length === 0) {
          if (alive) setState({ ...EMPTY, loading: false, updatedAt: Date.now() })
          return
        }
        const latest = await get<Latest>(`readings/latest?keys=${series.map((s) => encodeURIComponent(s.key)).join(',')}`)
        // Anchor the window to the newest reading, not to "now": when telemetry is
        // stale (link down, simulator paused) a wall-clock window would be empty.
        const newest = Math.max(0, ...Object.values(latest).map((l) => (l ? new Date(l.ts.endsWith('Z') ? l.ts : l.ts + 'Z').getTime() : 0)))
        const from = naiveUtc((newest > 0 ? Math.min(newest, Date.now()) : Date.now()) - 48 * 3600 * 1000)
        const tanks: TankStat[] = []
        const measured: number[] = []
        const perTank: Bucket[][] = []
        for (const s of series) {
          const isStore = /cache|ship-transfer/.test(s.asset_id)
          let burn = 0
          let spark: number[] = []
          try {
            const rows = await get<Bucket[]>(`series/${encodeURIComponent(s.key)}/readings?from=${encodeURIComponent(from)}&bucket=1h`)
            const asc = [...rows].reverse()
            const t0 = asc.length ? new Date(asc[0].ts).getTime() : 0
            const pts = asc.map((r) => ({ h: (new Date(r.ts).getTime() - t0) / 3.6e6, v: r.value }))
            burn = isStore ? 0 : Math.max(0, -slope(pts))
            if (!isStore && pts.length >= 3 && burn > 0) measured.push(burn)
            spark = asc.map((r) => r.value)
            perTank.push(asc)
          } catch {
            /* a series with no history just has no burn estimate */
          }
          tanks.push({
            key: s.key,
            asset_id: s.asset_id,
            litres: latest[s.key]?.value ?? 0,
            isStore,
            burnLph: burn,
            spark,
          })
        }
        const totalL = tanks.reduce((a, t) => a + t.litres, 0)
        const dayTanks = tanks.filter((t) => !t.isStore)
        const meanBurn = measured.length ? measured.reduce((a, b) => a + b, 0) / measured.length : 0
        const burnLph = tanks.reduce((a, t) => a + t.burnLph, 0) + (dayTanks.length - measured.length) * meanBurn
        const days = burnLph > 0.5 ? totalL / (burnLph * 24) : null
        // sum only the tanks that have (almost) the full window, so the curve is not a patchwork
        const longest = Math.max(0, ...perTank.map((p) => p.length))
        const hourly = new Map<number, number>()
        for (const p of perTank) {
          if (p.length < longest * 0.8) continue
          for (const r of p) {
            const hr = Math.floor(new Date(r.ts).getTime() / 3.6e6)
            hourly.set(hr, (hourly.get(hr) ?? 0) + r.value)
          }
        }
        const history = [...hourly.entries()].sort((a, b) => a[0] - b[0]).map(([h, litres]) => ({ t: h * 3.6e6, litres }))
        if (alive) setState({ loading: false, error: null, totalL, burnLph, days, tanks, measuredTanks: measured.length, history, updatedAt: Date.now() })
      } catch (e) {
        if (alive) setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : 'failed' }))
      }
    }

    setState(EMPTY)
    run()
    const t = setInterval(run, pollMs)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [station, pollMs])

  return state
}
