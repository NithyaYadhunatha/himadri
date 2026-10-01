// src/lib/forecast.ts
//
// Small, dependency-free forecaster used by the ML Lab. It picks between two
// methods by looking at the data:
//   • trend    — Theil–Sen line (robust to outliers) for signals that drift, e.g.
//                a fuel tank being drawn down;
//   • seasonal — hour-of-day mean profile for signals that cycle, e.g. generator
//                load or air temperature, where a straight line would be wrong.
// Both return a 95% prediction band from the in-sample residual spread.

export interface Pt {
  t: number // epoch ms
  v: number
}
export interface Fc {
  t: number
  v: number
  lo: number
  hi: number
}
export interface ForecastResult {
  method: 'trend' | 'seasonal'
  reason: string
  slopePerDay: number
  sigma: number
  points: Fc[]
}

function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}

function theilSen(pts: Pt[]): { slope: number; intercept: number } {
  const slopes: number[] = []
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dt = (pts[j].t - pts[i].t) / 86400000
      if (dt > 0.02) slopes.push((pts[j].v - pts[i].v) / dt)
    }
  }
  const slope = median(slopes)
  const intercept = median(pts.map((p) => p.v - slope * (p.t / 86400000)))
  return { slope, intercept }
}

export function forecast(pts: Pt[], horizonDays: number): ForecastResult | null {
  if (pts.length < 6) return null
  const sorted = [...pts].sort((a, b) => a.t - b.t)
  const { slope, intercept } = theilSen(sorted)
  const trendRes = sorted.map((p) => p.v - (intercept + slope * (p.t / 86400000)))
  const trendSigma = Math.sqrt(trendRes.reduce((a, r) => a + r * r, 0) / Math.max(1, trendRes.length - 2))

  // hour-of-day profile
  const bins: number[][] = Array.from({ length: 24 }, () => [])
  for (const p of sorted) bins[new Date(p.t).getUTCHours()].push(p.v)
  const mean = sorted.reduce((a, p) => a + p.v, 0) / sorted.length
  const prof = bins.map((b) => (b.length ? b.reduce((x, y) => x + y, 0) / b.length : mean))
  const seaRes = sorted.map((p) => p.v - prof[new Date(p.t).getUTCHours()])
  const seaSigma = Math.sqrt(seaRes.reduce((a, r) => a + r * r, 0) / Math.max(1, seaRes.length - 12))

  const spanDays = (sorted[sorted.length - 1].t - sorted[0].t) / 86400000
  const drift = Math.abs(slope) * Math.min(1, spanDays) // change over (up to) the observed day
  const useTrend = drift > 3 * Math.max(trendSigma, 1e-9) && drift > 3 * Math.max(seaSigma * 0.5, 1e-9)

  const last = sorted[sorted.length - 1].t
  const step = horizonDays <= 3 ? 3600000 : 6 * 3600000
  const n = Math.round((horizonDays * 86400000) / step)
  const points: Fc[] = []
  if (useTrend) {
    for (let i = 1; i <= n; i++) {
      const t = last + i * step
      const v = intercept + slope * (t / 86400000)
      const w = 1.96 * trendSigma * Math.sqrt(1 + (i * step) / 86400000 / Math.max(spanDays, 0.5) / 6)
      points.push({ t, v, lo: v - w, hi: v + w })
    }
    return { method: 'trend', reason: `steady drift of ${slope.toFixed(1)} per day dominates the noise`, slopePerDay: slope, sigma: trendSigma, points }
  }
  for (let i = 1; i <= n; i++) {
    const t = last + i * step
    const v = prof[new Date(t).getUTCHours()]
    const w = 1.96 * Math.max(seaSigma, 1e-9) * (1 + (spanDays < 2 ? 0.6 : 0.2))
    points.push({ t, v, lo: v - w, hi: v + w })
  }
  return { method: 'seasonal', reason: 'signal repeats on a daily cycle — projecting the hour-of-day profile, not a straight line', slopePerDay: slope, sigma: seaSigma, points }
}
