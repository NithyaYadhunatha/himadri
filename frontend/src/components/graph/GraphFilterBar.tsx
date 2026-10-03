'use client'

import { MapPin, Search, X } from 'lucide-react'
import { nodeTypeConfig } from '@/lib/graph/nodeTypes'
import type { NodeType } from '@/types/graph'
import type { HealthStatus } from '@/types/common'

interface FilterSelectProps { label: string; value: string; options: string[]; onChange: (value: string) => void; disabled?: boolean }
function FilterSelect({ label, value, options, onChange, disabled = false }: FilterSelectProps) {
  return <label className="min-w-0"><span className="mb-1 block text-[10px] font-mono uppercase tracking-wider text-white/58">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className="h-8 w-full min-w-0 appearance-none rounded border border-brand-border bg-brand-surface px-2 pr-7 text-xs text-white outline-none transition-colors hover:border-white/25 focus:border-cyan disabled:cursor-not-allowed disabled:text-white/50"><option value="">All {label}s</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
}

const HEALTH_OPTIONS: HealthStatus[] = ['healthy', 'degraded', 'critical', 'unreachable']

interface GraphFilterBarProps {
  search: string; onSearchChange: (value: string) => void
  activeType: NodeType | ''; onTypeChange: (value: NodeType | '') => void
  activeHealth: HealthStatus | ''; onHealthChange: (value: HealthStatus | '') => void
  zone: string; zones: string[]; onZoneChange: (value: string) => void
  onClearFilters: () => void
}

export function GraphFilterBar(props: GraphFilterBarProps) {
  const nodeTypes = Object.entries(nodeTypeConfig).map(([value, config]) => ({ value, label: config.label }))
  const hasActiveFilters = Boolean(props.search || props.activeType || props.activeHealth || props.zone)
  return <section className="shrink-0 border-b border-brand-border bg-brand-bg/80 px-4 py-3 backdrop-blur-sm">
    <div className="mb-3 flex items-center gap-2">
      <div className="relative w-full max-w-sm">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/55" />
        <input type="search" value={props.search} onChange={(event) => props.onSearchChange(event.target.value)} placeholder="Search assets..." className="w-full rounded border border-brand-border bg-brand-surface py-1.5 pl-8 pr-3 text-xs text-white outline-none placeholder:text-white/55 focus:border-cyan" />
      </div>
      {hasActiveFilters && <button onClick={props.onClearFilters} className="flex shrink-0 items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-white/62 hover:text-white"><X size={11} /> Clear filters</button>}
    </div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      <FilterSelect label="Zone" value={props.zone} options={props.zones} onChange={props.onZoneChange} />
      <label className="min-w-0">
        <span className="mb-1 block text-[10px] font-mono uppercase tracking-wider text-white/58">Health</span>
        <select value={props.activeHealth} onChange={(event) => props.onHealthChange(event.target.value as HealthStatus | '')} className="h-8 w-full min-w-0 appearance-none rounded border border-brand-border bg-brand-surface px-2 text-xs text-white outline-none hover:border-white/25 focus:border-cyan">
          <option value="">All health states</option>
          {HEALTH_OPTIONS.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
      </label>
      <label className="min-w-0">
        <span className="mb-1 block text-[10px] font-mono uppercase tracking-wider text-white/58">Asset category</span>
        <select value={props.activeType} onChange={(event) => props.onTypeChange(event.target.value as NodeType | '')} className="h-8 w-full min-w-0 appearance-none rounded border border-brand-border bg-brand-surface px-2 text-xs text-white outline-none hover:border-white/25 focus:border-cyan">
          <option value="">All categories</option>
          {nodeTypes.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <div className="hidden items-end xl:flex">
        <span className="flex h-8 items-center gap-1.5 rounded border border-cyan/20 bg-cyan/5 px-2 text-[10px] font-mono uppercase tracking-wider text-cyan/70">
          <MapPin size={11} /> Station-scoped twin
        </span>
      </div>
    </div>
  </section>
}
