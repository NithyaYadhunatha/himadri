// src/lib/chartTheme.ts
//
// One place for chart colours/axis styling so every Recharts graph in the app
// reads as part of the same ice-blue theme. Hex values mirror the tokens in
// globals.css (Recharts needs plain colours, not Tailwind classes).

export const CHART = {
  blue: '#1D1C93',
  green: '#0F8A6A',
  amber: '#D4820A',
  red: '#C23B3B',
  violet: '#A04FB8',
  ink: '#080330',
  grid: '#8E8EB0',
  muted: '#626079',
} as const

export const axisTick = {
  fill: '#080330b0',
  fontSize: 11,
  fontFamily: 'var(--font-mono)',
} as const

export const gridProps = {
  stroke: '#8E8EB0',
  strokeDasharray: '3 3',
  vertical: false,
} as const

/** Short "12 Oct" label from an ISO date string. */
export function shortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export function fmtNum(v: number, digits = 0): string {
  return v.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })
}

export function healthColor(score: number): string {
  return score >= 80 ? CHART.green : score >= 60 ? CHART.amber : CHART.red
}
