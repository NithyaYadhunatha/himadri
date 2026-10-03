// src/components/ui/Panel.tsx
//
// Shared page chrome so every screen uses the same header, card, KPI tile,
// segmented control and chart tooltip — the pieces that used to be redefined
// (slightly differently) on each page.
'use client'

import type { ReactNode } from 'react'

// ─── Page scaffolding ───────────────────────────────────────────────────────

export function PageShell({ children, width = 'max-w-[1400px]' }: { children: ReactNode; width?: string }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className={`${width} mx-auto px-6 py-6 space-y-6`}>{children}</div>
    </div>
  )
}

export function PageHeader({
  icon, title, subtitle, actions, eyebrow,
}: {
  icon?: ReactNode
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  eyebrow?: string
}) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="font-display text-[34px] md:text-[40px] leading-[1.05] text-white mt-1 tracking-tight flex items-center gap-3">
          {icon && <span className="text-cyan">{icon}</span>}
          {title}
        </h1>
        {subtitle && <p className="text-[13.5px] text-white/65 mt-2 max-w-3xl leading-relaxed">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  )
}

// ─── Panel (card with a titled header) ──────────────────────────────────────

export function Panel({
  title, subtitle, icon, actions, children, className = '', bodyClassName = '', accent,
}: {
  title?: string
  subtitle?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  /** Optional colour for a thin top accent bar. */
  accent?: string
}) {
  return (
    <section className={`panel relative ${className}`}>
      {accent && <div className="absolute top-0 left-4 right-4 h-0.5 rounded-b" style={{ background: accent }} />}
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0">
            {title && (
              <h2 className="font-display text-[19px] leading-tight text-white flex items-center gap-2">
                {icon && <span className="text-cyan">{icon}</span>}
                {title}
              </h2>
            )}
            {subtitle && <p className="text-white/62 text-xs mt-1 font-sans leading-relaxed">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">{actions}</div>}
        </header>
      )}
      <div className={`px-5 pb-5 ${title || actions ? '' : 'pt-4'} ${bodyClassName}`}>{children}</div>
    </section>
  )
}

// ─── KPI tile ───────────────────────────────────────────────────────────────

export function MetricTile({
  label, value, unit, hint, color, icon,
}: {
  label: string
  value: ReactNode
  unit?: string
  hint?: ReactNode
  color?: string
  icon?: ReactNode
}) {
  return (
    <div className="panel relative px-4 py-3.5 overflow-hidden">
      {color && <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: color }} />}
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow">{label}</p>
        {icon && <span className="text-white/55">{icon}</span>}
      </div>
      <p className="font-display text-[32px] leading-none mt-2" style={{ color: color ?? '#080330' }}>
        {value}
        {unit && <span className="text-xs font-medium text-white/62 ml-1.5">{unit}</span>}
      </p>
      {hint && <p className="font-sans text-xs text-white/62 mt-1.5 leading-snug">{hint}</p>}
    </div>
  )
}

// ─── Segmented control ──────────────────────────────────────────────────────

export function SegTabs<T extends string>({
  value, onChange, options, size = 'md',
}: {
  value: T
  onChange: (v: T) => void
  options: Array<{ value: T; label: string }>
  size?: 'sm' | 'md'
}) {
  return (
    <div className="inline-flex items-center gap-0.5 bg-brand-surface-2 border border-brand-border rounded-md p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`font-mono uppercase tracking-wider rounded transition-colors ${size === 'sm' ? 'text-[10px] px-2 py-1' : 'text-[11px] px-3 py-1.5'} ${
            value === o.value ? 'bg-cyan text-brand-bg font-bold shadow-sm' : 'text-white/70 hover:text-white hover:bg-brand-surface-3'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ─── Chart bits ─────────────────────────────────────────────────────────────

export function LegendDot({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-white/70">
      <span
        className="inline-block w-3.5 h-0 border-t-2"
        style={{ borderColor: color, borderStyle: dashed ? 'dashed' : 'solid' }}
      />
      {label}
    </span>
  )
}

interface TooltipEntry {
  name?: string
  value?: number | string
  color?: string
  dataKey?: string | number
  payload?: Record<string, unknown>
}

/**
 * Tooltip for Recharts. Pass `format` to control how each value prints, and
 * `hide` to drop helper series (e.g. the stacked base of a confidence band).
 */
export function ChartTooltip({
  active, payload, label, labelFormatter, format, hide = [],
}: {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string | number
  labelFormatter?: (l: string | number) => string
  format?: (v: number, name: string) => string
  hide?: string[]
}) {
  if (!active || !payload?.length) return null
  const rows = payload.filter((p) => p.name && !hide.includes(String(p.dataKey)) && typeof p.value !== 'undefined')
  if (!rows.length) return null
  return (
    <div className="bg-brand-surface border border-brand-border rounded-md px-3 py-2 shadow-lg">
      {label !== undefined && (
        <p className="font-mono text-[11px] text-white/70 mb-1">{labelFormatter ? labelFormatter(label) : label}</p>
      )}
      {rows.map((p, i) => (
        <p key={i} className="font-mono text-xs flex items-center gap-2" style={{ color: p.color }}>
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-white/80">{p.name}</span>
          <span className="font-bold ml-auto pl-3">
            {typeof p.value === 'number' ? (format ? format(p.value, p.name ?? '') : p.value.toLocaleString()) : p.value}
          </span>
        </p>
      ))}
    </div>
  )
}

/** Thin progress bar used for stock levels, health, etc. */
export function Bar({ value, max = 100, color, height = 'h-2' }: { value: number; max?: number; color: string; height?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className={`${height} rounded-full bg-brand-surface-3 overflow-hidden`}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

export const inputClass =
  'w-full bg-brand-bg border border-brand-border rounded-md px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-cyan focus:ring-1 focus:ring-cyan/30 transition-colors'

export const labelClass = 'font-mono text-[11px] text-white/70 uppercase tracking-wider mb-1.5 block'

/** Honest-labelling chip shown wherever the synthetic-data model drives a number. */
export function SyntheticChip({ className = '' }: { className?: string }) {
  return (
    <span
      title="This model was trained on a synthetic dataset (backend/ml). It has not been validated against real station data."
      className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-amber bg-amber/10 border border-amber/40 rounded px-2 py-0.5 ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber" />
      Synthetic-data model
    </span>
  )
}
