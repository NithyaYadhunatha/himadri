'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Search, SlidersHorizontal, RefreshCw, CheckCircle,
  AlertTriangle, AlertCircle, Server, ArrowUpDown,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { QrCode } from 'lucide-react'
import { NodeCard } from '@/components/nodes/NodeCard'
import { NodeInspector } from '@/components/graph/NodeInspector'
import { Button } from '@/components/ui/Button'
import { InlineLoader, ErrorState, EmptyState } from '@/components/ui/Loader'
import { nodeHealthService } from '@/services/nodeHealth.service'
import { useStationStore } from '@/store/useStationStore'
import { ROUTES } from '@/lib/constants'
import type { NodeHealth, NodeFiltersInput, NodeSummary } from '@/types/nodes'
import type { GraphNode, NodeType } from '@/types/graph'
import type { BadgeVariant } from '@/types/common'
import { HEALTH_COLORS, ASSET_CATEGORIES, ASSET_CATEGORY_ABBREV } from '@/lib/constants'

// ─── Types ────────────────────────────────────────────────────────────────────

type SortKey = 'risk' | 'name'
type HealthFilter = 'all' | 'critical' | 'degraded' | 'healthy'

// ─── Summary Bar ─────────────────────────────────────────────────────────────

interface SummaryCardProps {
  label: string
  value: number
  color: string
  active: boolean
  onClick: () => void
  icon: React.ReactNode
}

function SummaryCard({ label, value, color, active, onClick, icon }: SummaryCardProps) {
  return (
    <button
      onClick={onClick}
      className={`
        flex-1 min-w-[140px] flex items-center gap-3 p-4 rounded border transition-all duration-200
        text-left cursor-pointer
        ${active ? '' : 'bg-brand-surface border-brand-border hover:border-white/20 hover:bg-brand-surface-2'}
      `}
      style={active ? { borderColor: `${color}60`, backgroundColor: `${color}10` } : {}}
    >
      <div
        className="w-10 h-10 rounded flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}18`, border: `1px solid ${color}30` }}
      >
        <span style={{ color }}>{icon}</span>
      </div>
      <div>
        <p className="font-mono text-2xl font-bold leading-none" style={{ color }}>
          {value}
        </p>
        <p className="font-mono text-[10px] text-white/50 uppercase tracking-widest mt-0.5">{label}</p>
      </div>
    </button>
  )
}

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'risk', label: 'Risk' },
  { key: 'name', label: 'Name' },
]

const FILTER_OPTIONS: { key: HealthFilter; label: string; variant: BadgeVariant }[] = [
  { key: 'all', label: 'All', variant: 'neutral' },
  { key: 'critical', label: 'Critical', variant: 'critical' },
  { key: 'degraded', label: 'At Risk', variant: 'warning' },
  { key: 'healthy', label: 'Healthy', variant: 'healthy' },
]

interface FilterBarProps {
  sort: SortKey
  filter: HealthFilter
  search: string
  category: NodeType | ''
  onSort: (k: SortKey) => void
  onFilter: (k: HealthFilter) => void
  onSearch: (v: string) => void
  onCategory: (c: NodeType | '') => void
  resultCount: number
}

function FilterBar({ sort, filter, search, category, onSort, onFilter, onSearch, onCategory, resultCount }: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 p-4 border-b border-brand-border bg-brand-bg">
      <div className="relative flex-1 min-w-[200px] max-w-xs">
        <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search assets..."
          className="w-full bg-brand-surface border border-brand-border rounded pl-8 pr-3 py-1.5
            text-xs font-sans text-white placeholder:text-white/25
            focus:outline-none focus:border-cyan/50 focus:ring-1 focus:ring-cyan/20 transition-all"
        />
      </div>

      <select
        value={category}
        onChange={(e) => onCategory(e.target.value as NodeType | '')}
        className="bg-brand-surface border border-brand-border rounded px-2 py-1.5 text-xs font-mono text-white/70 focus:outline-none focus:border-cyan/50"
      >
        <option value="">All Categories</option>
        {ASSET_CATEGORIES.map((c) => (
          <option key={c} value={c}>{ASSET_CATEGORY_ABBREV[c]} — {c}</option>
        ))}
      </select>

      <div className="flex items-center gap-1.5">
        <ArrowUpDown size={11} className="text-white/30" />
        <span className="font-mono text-[10px] text-white/40 uppercase">Sort:</span>
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => onSort(opt.key)}
            className={`px-2.5 py-1 rounded font-mono text-[10px] uppercase tracking-wider transition-colors ${
              sort === opt.key ? 'bg-cyan/10 border border-cyan/40 text-cyan' : 'text-white/40 hover:text-white border border-transparent'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <SlidersHorizontal size={11} className="text-white/30" />
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => onFilter(opt.key)}
            className={`px-2.5 py-1 rounded font-mono text-[10px] uppercase tracking-wider transition-colors ${
              filter === opt.key ? 'bg-cyan/10 border border-cyan/40 text-cyan' : 'text-white/40 hover:text-white border border-transparent'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="ml-auto">
        <span className="font-mono text-[10px] text-white/30">{resultCount} assets</span>
      </div>
    </div>
  )
}

const REFRESH_INTERVAL = 30

export default function AssetsPage() {
  const station = useStationStore((s) => s.station)
  const [nodes, setNodes] = useState<NodeHealth[]>([])
  const [summary, setSummary] = useState<NodeSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [sort, setSort] = useState<SortKey>('risk')
  const [filter, setFilter] = useState<HealthFilter>('all')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<NodeType | ''>('')

  const [selectedNode, setSelectedNode] = useState<NodeHealth | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(false)

  const isMounted = useRef(true)
  useEffect(() => {
    isMounted.current = true
    return () => { isMounted.current = false }
  }, [])

  const handleNodeRemoved = useCallback((nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId))
    setInspectorOpen((open) => (selectedNode?.id === nodeId ? false : open))
  }, [selectedNode])

  const loadData = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true)
    setError(null)
    try {
      const filters: NodeFiltersInput = {
        sortBy: sort,
        search: search || undefined,
        health: filter !== 'all' ? [filter] : undefined,
        type: category ? [category] : undefined,
      }
      const [nodeList, nodeSummary] = await Promise.all([
        nodeHealthService.getNodes(filters),
        nodeHealthService.getSummary(station),
      ])
      if (isMounted.current) {
        setNodes(nodeList.filter((n) => !n.stationId || n.stationId === station))
        setSummary(nodeSummary)
      }
    } catch {
      if (isMounted.current) setError('Failed to load asset health data')
    } finally {
      if (isMounted.current) setLoading(false)
    }
  }, [sort, filter, search, category, station])

  useEffect(() => { loadData(true) }, [loadData])

  useEffect(() => {
    const id = setInterval(() => loadData(false), REFRESH_INTERVAL * 1000)
    return () => clearInterval(id)
  }, [loadData])

  const handleStatClick = (f: HealthFilter) => setFilter((prev) => (prev === f ? 'all' : f))

  const handleRemediate = async (nodeId: string): Promise<void> => {
    const target = nodes.find((n) => n.id === nodeId)
    if (target) { setSelectedNode(target); setInspectorOpen(true) }
  }

  const handleNodeSelect = (node: NodeHealth) => {
    setSelectedNode(node)
    setInspectorOpen(true)
  }

  const asGraphNode = (n: NodeHealth): GraphNode => ({
    id: n.id,
    label: n.name,
    type: n.type,
    health: n.health,
    healthScore: n.healthScore,
    layer: n.type,
    version: n.version,
    stationId: n.stationId,
    dependencyCount: 0,
    dependencies: [],
    dependents: [],
    incidents: n.incidents,
    lastSync: n.lastSync,
    metadata: {},
  })

  const statCards = summary
    ? [
        { label: 'Total Assets', value: summary.total, color: '#1D1C93', icon: <Server size={18} />, key: 'all' as HealthFilter },
        { label: 'Critical', value: summary.critical, color: HEALTH_COLORS.critical, icon: <AlertCircle size={18} />, key: 'critical' as HealthFilter },
        { label: 'At Risk', value: summary.atRisk, color: HEALTH_COLORS.degraded, icon: <AlertTriangle size={18} />, key: 'degraded' as HealthFilter },
        { label: 'Healthy', value: summary.healthy, color: HEALTH_COLORS.healthy, icon: <CheckCircle size={18} />, key: 'healthy' as HealthFilter },
      ]
    : []

  return (
    <>
      <div className="h-full flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-brand-border bg-gradient-to-b from-brand-surface to-brand-bg shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-mono text-sm font-semibold text-white uppercase tracking-widest">
                Asset Health — {station.toUpperCase()}
              </h1>
              <p className="text-white/40 text-xs mt-0.5 font-sans">
                Live station asset health · <span className="text-white/60">{summary?.total ?? '—'} assets monitored</span>
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link href={ROUTES.QR_SHEET}>
                <Button variant="secondary" size="sm" icon={<QrCode size={12} />}>
                  QR Sheet
                </Button>
              </Link>
              <Button variant="secondary" size="sm" icon={<RefreshCw size={12} />} onClick={() => loadData(false)}>
                Refresh
              </Button>
            </div>
          </div>

          <div className="flex gap-3 mt-4 flex-wrap">
            {loading && !summary
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex-1 min-w-[140px] h-[72px] bg-brand-surface border border-brand-border rounded animate-pulse-slow" />
                ))
              : statCards.map((card) => (
                  <SummaryCard
                    key={card.label}
                    label={card.label}
                    value={card.value}
                    color={card.color}
                    icon={card.icon}
                    active={filter === card.key}
                    onClick={() => handleStatClick(card.key)}
                  />
                ))}
          </div>
        </div>

        <FilterBar
          sort={sort}
          filter={filter}
          search={search}
          category={category}
          onSort={setSort}
          onFilter={setFilter}
          onSearch={setSearch}
          onCategory={setCategory}
          resultCount={nodes.length}
        />

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error && (
            <div className="flex items-center justify-center h-48">
              <ErrorState message={error} onRetry={() => loadData(true)} />
            </div>
          )}

          {loading && !error && (
            <div className="flex items-center justify-center h-48">
              <InlineLoader text="Loading asset health…" />
            </div>
          )}

          {!loading && !error && nodes.length === 0 && (
            <div className="flex items-center justify-center h-48">
              <EmptyState message="No assets match your filters" hint='Try clearing filters or selecting "All"' />
            </div>
          )}

          {!loading && !error && nodes.length > 0 && (
            <AnimatePresence mode="popLayout">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {nodes.map((node, i) => (
                  <motion.div
                    key={node.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.2, delay: i * 0.03 }}
                  >
                    <NodeCard node={node} onSelect={handleNodeSelect} onRemediate={handleRemediate} />
                  </motion.div>
                ))}
              </div>
            </AnimatePresence>
          )}
        </div>

        <div className="shrink-0 px-6 py-2 border-t border-brand-border bg-brand-bg flex items-center justify-between">
          <div className="flex items-center gap-4">
            {summary && (
              <>
                {[
                  { color: HEALTH_COLORS.critical, label: `${summary.critical} critical` },
                  { color: HEALTH_COLORS.degraded, label: `${summary.atRisk} at risk` },
                  { color: HEALTH_COLORS.healthy, label: `${summary.healthy} healthy` },
                  { color: '#626079', label: `${summary.unreachable} unreachable` },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                    <span className="font-mono text-[10px] text-white/40">{label}</span>
                  </div>
                ))}
              </>
            )}
          </div>
          <span className="font-mono text-[10px] text-white/20">Auto-refresh every {REFRESH_INTERVAL}s</span>
        </div>
      </div>

      <NodeInspector
        node={selectedNode ? asGraphNode(selectedNode) : null}
        open={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        canRemove={true}
        onRemoved={handleNodeRemoved}
      />
    </>
  )
}
