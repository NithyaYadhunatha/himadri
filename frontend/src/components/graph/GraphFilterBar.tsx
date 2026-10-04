'use client'

import { MapPin, Search, X } from 'lucide-react'
import { nodeTypeConfig } from '@/lib/graph/nodeTypes'
import type { NodeType } from '@/types/graph'
import type { HealthStatus } from '@/types/common'

const selectCls =
  'h-9 min-w-[150px] appearance-none rounded-full border border-brand-border bg-brand-surface px-3.5 text-[13px] text-white outline-none transition-colors hover:border-cyan focus:border-cyan focus:ring-2 focus:ring-cyan/20'

const HEALTH_OPTIONS: HealthStatus[] = ['healthy', 'degraded', 'critical', 'unreachable']

interface GraphFilterBarProps {
  search: string; onSearchChange: (value: string) => void
  activeType: NodeType | ''; onTypeChange: (value: NodeType | '') => void
  activeHealth: HealthStatus | ''; onHealthChange: (value: HealthStatus | '') => void
  zone: string; zones: string[]; onZoneChange: (value: string) => void
  onClearFilters: () => void
}

// One compact row: search + the three filters + a scope chip. (This used to
// take three stacked rows, which ate a third of the canvas height.)
export function GraphFilterBar(props: GraphFilterBarProps) {
  const nodeTypes = Object.entries(nodeTypeConfig).map(([value, config]) => ({ value, label: config.label }))
  const hasActiveFilters = Boolean(props.search || props.activeType || props.activeHealth || props.zone)
  return (
    <section className="shrink-0 border-b border-brand-border bg-brand-bg/80 px-4 py-2.5 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative w-full max-w-[280px]">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/60" />
          <input
            type="search"
            value={props.search}
            onChange={(event) => props.onSearchChange(event.target.value)}
            placeholder="Search assets…"
            aria-label="Search assets"
            className="h-9 w-full rounded-full border border-brand-border bg-brand-surface pl-9 pr-3 text-[13px] text-white outline-none placeholder:text-white/60 focus:border-cyan focus:ring-2 focus:ring-cyan/20"
          />
        </div>
        <select aria-label="Zone" value={props.zone} onChange={(e) => props.onZoneChange(e.target.value)} className={selectCls}>
          <option value="">All zones</option>
          {props.zones.map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
        <select aria-label="Health" value={props.activeHealth} onChange={(e) => props.onHealthChange(e.target.value as HealthStatus | '')} className={selectCls}>
          <option value="">All health states</option>
          {HEALTH_OPTIONS.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
        <select aria-label="Asset category" value={props.activeType} onChange={(e) => props.onTypeChange(e.target.value as NodeType | '')} className={selectCls}>
          <option value="">All categories</option>
          {nodeTypes.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
        </select>
        {hasActiveFilters && (
          <button onClick={props.onClearFilters} className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-[12px] font-semibold uppercase tracking-wider text-cyan hover:underline">
            <X size={12} /> Clear
          </button>
        )}
        <span className="ml-auto hidden h-9 items-center gap-1.5 rounded-full border border-cyan/25 bg-cyan/5 px-3 text-[12px] font-semibold uppercase tracking-wider text-cyan xl:flex">
          <MapPin size={12} /> Station-scoped twin
        </span>
      </div>
    </section>
  )
}
