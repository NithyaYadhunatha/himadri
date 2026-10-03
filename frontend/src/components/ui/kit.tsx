// src/components/ui/kit.tsx
//
// HIMADRI "Paper & Ink" command-centre kit: the handful of building blocks the
// command pages share (panel, KPI tile, pill, meter, sparkline, live dot).
// Everything reads from the theme tokens in globals.css.
'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

export type Tone = 'ink' | 'primary' | 'ok' | 'warn' | 'crit' | 'mute'

export const TONE_HEX: Record<Tone, string> = {
  ink: '#080330',
  primary: '#1D1C93',
  ok: '#0F8A6A',
  warn: '#D4820A',
  crit: '#C23B3B',
  mute: '#626079',
}

const TONE_TEXT: Record<Tone, string> = {
  ink: 'text-white',
  primary: 'text-cyan',
  ok: 'text-emerald',
  warn: 'text-amber',
  crit: 'text-crimson',
  mute: 'text-white/65',
}

const TONE_SOFT: Record<Tone, string> = {
  ink: 'bg-white/5 border-white/15 text-white/70',
  primary: 'bg-cyan/10 border-cyan/30 text-cyan',
  ok: 'bg-emerald/10 border-emerald/30 text-emerald',
  warn: 'bg-amber/12 border-amber/35 text-amber',
  crit: 'bg-crimson/10 border-crimson/30 text-crimson',
  mute: 'bg-white/5 border-white/10 text-white/65',
}

/* ── Panel ───────────────────────────────────────────────────── */
export function Panel({
  title,
  eyebrow,
  right,
  children,
  className = '',
  pad = true,
}: {
  title?: string
  eyebrow?: string
  right?: ReactNode
  children: ReactNode
  className?: string
  pad?: boolean
}) {
  return (
    <section className={`panel ${className}`}>
      {(title || eyebrow || right) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-brand-border/70">
          <div className="min-w-0">
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            {title && <h3 className="font-display text-[17px] leading-tight text-white mt-0.5">{title}</h3>}
          </div>
          {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
        </header>
      )}
      <div className={pad ? 'p-5' : ''}>{children}</div>
    </section>
  )
}

/* ── Animated number ─────────────────────────────────────────── */
export function AnimatedNumber({
  value,
  digits = 0,
  duration = 900,
  prefix = '',
  suffix = '',
}: {
  value: number | null | undefined
  digits?: number
  duration?: number
  prefix?: string
  suffix?: string
}) {
  const [shown, setShown] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    if (value === null || value === undefined || Number.isNaN(value)) return
    const start = performance.now()
    const a = from.current
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const e = 1 - Math.pow(1 - p, 3)
      setShown(a + (value - a) * e)
      if (p < 1) raf = requestAnimationFrame(tick)
      else from.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  if (value === null || value === undefined || Number.isNaN(value)) return <span className="num">—</span>
  return (
    <span className="num">
      {prefix}
      {shown.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}
      {suffix}
    </span>
  )
}

/* ── Sparkline (dependency-free SVG) ─────────────────────────── */
export function Spark({
  values,
  tone = 'primary',
  height = 34,
  width = 120,
  fill = true,
}: {
  values: number[]
  tone?: Tone
  height?: number
  width?: number
  fill?: boolean
}) {
  if (!values || values.length < 2) {
    return <div style={{ height }} className="border-b border-dashed border-brand-border w-full" />
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width
    const y = height - 3 - ((v - min) / span) * (height - 6)
    return [x, y] as const
  })
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${d} L${width},${height} L0,${height} Z`
  const c = TONE_HEX[tone]
  const id = `sp${tone}${values.length}`
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ height }} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c} stopOpacity="0.22" />
          <stop offset="100%" stopColor={c} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#${id})`} />}
      <path d={d} fill="none" stroke={c} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/* ── KPI tile ────────────────────────────────────────────────── */
export function Kpi({
  label,
  value,
  unit,
  digits = 0,
  tone = 'ink',
  hint,
  spark,
  icon,
  badge,
  className = '',
}: {
  label: string
  value: number | null | undefined
  unit?: string
  digits?: number
  tone?: Tone
  hint?: ReactNode
  spark?: number[]
  icon?: ReactNode
  badge?: ReactNode
  className?: string
}) {
  return (
    <div className={`panel p-4 flex flex-col gap-2 relative overflow-hidden ${className}`}>
      <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r" style={{ background: TONE_HEX[tone] }} />
      <div className="flex items-center justify-between gap-2 pl-1">
        <p className="eyebrow truncate">{label}</p>
        {icon ? <span className="text-white/58 shrink-0">{icon}</span> : badge}
      </div>
      <div className="flex items-baseline gap-1.5 pl-1">
        <span className={`font-display text-[34px] leading-none tracking-tight ${TONE_TEXT[tone]}`}>
          <AnimatedNumber value={value} digits={digits} />
        </span>
        {unit && <span className="font-mono text-[11px] text-white/65">{unit}</span>}
      </div>
      {spark && (
        <div className="pl-1 -mb-1">
          <Spark values={spark} tone={tone === 'ink' ? 'primary' : tone} />
        </div>
      )}
      {hint && <div className="pl-1 font-mono text-[10.5px] text-white/70 leading-snug">{hint}</div>}
    </div>
  )
}

/* ── Pill ────────────────────────────────────────────────────── */
export function Pill({
  tone = 'mute',
  children,
  dot,
  className = '',
}: {
  tone?: Tone
  children: ReactNode
  dot?: boolean
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-[3px] font-mono text-[10px] uppercase tracking-wider whitespace-nowrap ${TONE_SOFT[tone]} ${className}`}
    >
      {dot && <LiveDot tone={tone} size={6} />}
      {children}
    </span>
  )
}

export function LiveDot({ tone = 'ok', size = 8, pulse = true }: { tone?: Tone; size?: number; pulse?: boolean }) {
  const c = TONE_HEX[tone]
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {pulse && <span className="absolute inset-0 rounded-full animate-ping opacity-60" style={{ background: c }} />}
      <span className="relative rounded-full" style={{ width: size, height: size, background: c }} />
    </span>
  )
}

/* ── Provenance badge (FR-96) ────────────────────────────────── */
const PROV: Record<string, { tone: Tone; label: string }> = {
  verified: { tone: 'ok', label: 'Verified' },
  documentary: { tone: 'primary', label: 'Documentary' },
  simulated: { tone: 'warn', label: 'Simulated' },
  unverified: { tone: 'mute', label: 'Unverified' },
  live: { tone: 'ok', label: 'Live' },
  derived: { tone: 'primary', label: 'Derived' },
}
export function Provenance({ kind, className = '' }: { kind: string; className?: string }) {
  const p = PROV[kind] ?? PROV.unverified
  return (
    <Pill tone={p.tone} className={className}>
      {p.label}
    </Pill>
  )
}

/* ── Meter ───────────────────────────────────────────────────── */
export function Meter({
  value,
  max = 100,
  tone = 'primary',
  height = 8,
  label,
  right,
}: {
  value: number
  max?: number
  tone?: Tone
  height?: number
  label?: ReactNode
  right?: ReactNode
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className="w-full">
      {(label || right) && (
        <div className="flex justify-between font-mono text-[10.5px] text-white/55 mb-1">
          <span>{label}</span>
          <span className="num">{right}</span>
        </div>
      )}
      <div className="w-full rounded-full bg-brand-surface-3 overflow-hidden" style={{ height }}>
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%`, background: TONE_HEX[tone] }}
        />
      </div>
    </div>
  )
}

/* ── Page heading ────────────────────────────────────────────── */
export function PageHead({
  eyebrow,
  title,
  sub,
  right,
}: {
  eyebrow: string
  title: string
  sub?: string
  right?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="font-display text-[34px] md:text-[40px] leading-[1.05] text-white mt-1 tracking-tight">{title}</h1>
        {sub && <p className="text-[13.5px] text-white/55 mt-2 max-w-2xl leading-relaxed">{sub}</p>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-shimmer rounded-lg ${className}`} />
}

/* ── Text tile (a KPI whose value is a word, not a number) ───── */
export function Tile({ label, value, hint, icon, tone = "primary" }: { label: string; value: string; hint?: ReactNode; icon?: ReactNode; tone?: Tone }) {
  return (
    <div className="panel p-4 flex flex-col gap-2 relative overflow-hidden">
      <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r" style={{ background: TONE_HEX[tone] }} />
      <div className="flex items-center justify-between pl-1">
        <p className="eyebrow">{label}</p>
        {icon && <span className="text-white/58">{icon}</span>}
      </div>
      <p className="pl-1 font-display text-[24px] leading-tight text-white truncate">{value}</p>
      {hint && <p className="pl-1 font-mono text-[10.5px] text-white/70">{hint}</p>}
    </div>
  )
}
