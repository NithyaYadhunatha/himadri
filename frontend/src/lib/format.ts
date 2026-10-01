// src/lib/format.ts
export function fmtNum(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return n.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function fmtBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

export function ago(iso: string | number | null | undefined): string {
  if (!iso) return 'never'
  const t = typeof iso === 'number' ? iso : new Date(iso.endsWith('Z') || /[+-]\d\d:\d\d$/.test(iso) ? iso : iso + 'Z').getTime()
  const s = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

/** Backend timestamps are UTC; some come with a trailing Z, some are naive. */
export function toMs(iso: string): number {
  return new Date(/Z$|[+-]\d\d:\d\d$/.test(iso) ? iso : iso + "Z").getTime()
}

/** Naive-UTC ISO string (no Z) — the backend compares against naive DB columns and 500s on tz-aware input. */
export function naiveUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19)
}
