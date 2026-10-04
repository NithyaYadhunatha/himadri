'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { Activity, ChevronsRight, ChevronsLeft, Plus, X, Minimize, Sparkles, Link2, MoreHorizontal } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ErrorState } from '@/components/ui/Loader'
import { NodeInspector } from '@/components/graph/NodeInspector'
import { GraphFilterBar } from '@/components/graph/GraphFilterBar'
import { ViewControlsBar } from '@/components/graph/ViewControlsBar'
import { ConnectNodeModal } from '@/components/nodes/ConnectNodeModal'
import { CreateCustomNodeModal } from '@/components/nodes/CreateCustomNodeModal'
import { AddEdgeModal } from '@/components/graph/AddEdgeModal'
import { EdgeActionBar } from '@/components/graph/EdgeActionBar'
import { graphService } from '@/services/graph.service'
import { useStationStore } from '@/store/useStationStore'
import type { GraphNode, GraphEdge, NodeType, ZoneMeta } from '@/types/graph'
import type { HealthStatus } from '@/types/common'
import type { LayoutPreset, NodeSizeMode, ColorMode } from '@/lib/models/UserPreferences'
import { HEALTH_COLORS } from '@/lib/constants'
import { computeWeightedRisk, weightedRiskColor } from '@/lib/graph/riskWeighting'

const FlowCanvas = dynamic(() => import('@/components/graph/FlowCanvas').then((m) => m.FlowCanvas), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-brand-bg">
      <div className="font-mono text-xs text-white/55 animate-pulse">Initializing graph engine...</div>
    </div>
  ),
})

const REFRESH_INTERVAL_MS = 30_000

function DarkTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { color: string } }> }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div className="bg-brand-surface border border-brand-border rounded p-2 shadow-lg">
      <p className="font-mono text-[10px] text-white/75 mb-1">{payload[0].name}</p>
      <p className="font-mono text-sm" style={{ color: payload[0].payload.color }}>
        {payload[0].value} assets
      </p>
    </div>
  )
}

export default function StationTwinPage() {
  const station = useStationStore((s) => s.station)
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [stationZones, setStationZones] = useState<ZoneMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [connectModalOpen, setConnectModalOpen] = useState(false)
  const [createCustomModalOpen, setCreateCustomModalOpen] = useState(false)
  const [addEdgeModalOpen, setAddEdgeModalOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [activeType, setActiveType] = useState<NodeType | ''>('')
  const [activeHealth, setActiveHealth] = useState<HealthStatus | ''>('')
  const [zone, setZone] = useState('')

  const [layoutPreset, setLayoutPreset] = useState<LayoutPreset>('TB')
  const [nodeSizeMode, setNodeSizeMode] = useState<NodeSizeMode>('normal')
  const [colorMode, setColorMode] = useState<ColorMode>('type')
  const [showEdgeLabels, setShowEdgeLabels] = useState(false)
  const [showLegend, setShowLegend] = useState(true)

  const [isFullscreen, setIsFullscreen] = useState(false)
  const graphContainerRef = useRef<HTMLDivElement>(null)

  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!moreMenuOpen) return
    function onClickOutside(e: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) setMoreMenuOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [moreMenuOpen])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Fetched together (not zones-after-graph) so FlowCanvas's first
      // render for this station already has both — its zone-banded layout
      // only runs once per "new node set arrives" (see FlowCanvas's
      // positionedIdsRef), so zones landing a tick after nodes would
      // otherwise permanently miss the banding for that node set and fall
      // back to plain dagre. Zones are still best-effort: a failure here
      // just means that fallback, not a page error, so it's outside the
      // graph fetch's own try/catch path.
      const [g, zonesResult] = await Promise.all([
        graphService.getLiveGraph(station),
        graphService.getZones(station).catch(() => []),
      ])
      setNodes(g.nodes)
      setEdges(g.edges)
      setStationZones(zonesResult)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [station])

  useEffect(() => { load() }, [load])

  // Backend WS event schema for the new Asset/Reading model isn't part of
  // this pass's verified surface (only "WS /ws" is documented, without a
  // frame schema) — rather than guess at event names, this refreshes on a
  // 30s poll like /assets does, which degrades gracefully against a backend
  // that has no live socket at all.
  useEffect(() => {
    const id = setInterval(load, REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [load])

  // Deep link: /twin?asset=<id> (from Alerts / Mission Control "Locate") selects that asset
  const deepLinked = useRef(false)
  useEffect(() => {
    if (deepLinked.current || nodes.length === 0) return
    const id = new URLSearchParams(window.location.search).get('asset')
    if (!id) return
    const hit = nodes.find((n) => n.id === id)
    if (hit) {
      deepLinked.current = true
      setSelectedNode(hit)
      setInspectorOpen(true)
    }
  }, [nodes])

  const handleFullscreen = useCallback(() => {
    if (!graphContainerRef.current) return
    if (!document.fullscreenElement) {
      graphContainerRef.current.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }, [])

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const handleClearNodeSelection = useCallback(() => {
    setSelectedNode(null)
    setInspectorOpen(false)
    setSelectedEdgeId(null)
  }, [])

  const handleNodeSelect = useCallback((node: GraphNode) => {
    if (selectedNode?.id === node.id) {
      handleClearNodeSelection()
      return
    }
    setSelectedNode(node)
    setInspectorOpen(true)
    setSelectedEdgeId(null)
  }, [selectedNode?.id, handleClearNodeSelection])

  const handleJumpToNode = useCallback((nodeId: string) => {
    const target = nodes.find((n) => n.id === nodeId)
    if (target) handleNodeSelect(target)
  }, [nodes, handleNodeSelect])

  const handleAddEdge = useCallback((edge: GraphEdge) => {
    setEdges((prev) => [...prev, edge])
    fetch(`/api/nodes/${encodeURIComponent(edge.source)}/edges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_id: edge.target, rel_type: edge.type }),
    }).catch(() => {})
  }, [])

  const handleDeleteSelectedEdge = useCallback(() => {
    if (!selectedEdgeId) return
    setEdges((prev) => {
      const edge = prev.find((e) => e.id === selectedEdgeId)
      if (edge) {
        fetch(`/api/nodes/${encodeURIComponent(edge.source)}/edges/${encodeURIComponent(edge.target)}`, {
          method: 'DELETE',
        }).catch(() => {})
      }
      return prev.filter((e) => e.id !== selectedEdgeId)
    })
    setSelectedEdgeId(null)
  }, [selectedEdgeId])

  const clearFilters = useCallback(() => {
    setSearch('')
    setActiveType('')
    setActiveHealth('')
    setZone('')
  }, [])

  const zones = useMemo(
    () => [...new Set(nodes.map((n) => n.zoneId).filter((z): z is string => Boolean(z)))].sort(),
    [nodes],
  )

  const filteredNodes = useMemo(() => {
    return nodes.filter((n) => {
      if (search && !n.label.toLowerCase().includes(search.toLowerCase())) return false
      if (activeType && n.type !== activeType) return false
      if (activeHealth && n.health !== activeHealth) return false
      if (zone && n.zoneId !== zone) return false
      return true
    })
  }, [nodes, search, activeType, activeHealth, zone])

  const filteredIds = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes])
  const filteredEdges = useMemo(
    () => edges.filter((e) => filteredIds.has(e.source) && filteredIds.has(e.target)),
    [edges, filteredIds],
  )

  const nonSimNodes = nodes.filter((n) => !n.isSimulating)
  const simulatingNodes = nodes.filter((n) => n.isSimulating)

  const healthData = [
    { name: 'Healthy', value: nonSimNodes.filter((n) => n.healthScore >= 80).length, color: HEALTH_COLORS.healthy },
    { name: 'Degraded', value: nonSimNodes.filter((n) => n.healthScore >= 50 && n.healthScore < 80).length, color: HEALTH_COLORS.degraded },
    { name: 'Critical', value: nonSimNodes.filter((n) => n.healthScore > 0 && n.healthScore < 50).length, color: HEALTH_COLORS.critical },
    { name: 'Offline', value: nonSimNodes.filter((n) => n.healthScore === 0).length, color: HEALTH_COLORS.unreachable },
    { name: 'Simulating', value: simulatingNodes.length, color: HEALTH_COLORS.simulating },
  ].filter((d) => d.value > 0)

  const atRiskNodes = [...nonSimNodes].filter((n) => n.health === 'degraded').sort((a, b) => a.healthScore - b.healthScore).slice(0, 6)
  const criticalNodes = [...nonSimNodes].filter((n) => n.health === 'critical' || n.health === 'unreachable').sort((a, b) => a.healthScore - b.healthScore).slice(0, 6)

  return (
    <>
      <div className="h-full flex flex-col overflow-hidden bg-brand-bg">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-brand-border shrink-0 bg-brand-bg">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-cyan" />
            <h1 className="font-mono text-xs font-bold text-white uppercase tracking-widest">
              Station Twin — {station.toUpperCase()}
            </h1>
            <span className="text-white/50">·</span>
            <span className="font-mono text-[10px] text-white/62">{filteredNodes.length} / {nodes.length} assets</span>
          </div>
          <div className="flex items-center gap-1.5">
            {selectedNode && (
              <button
                onClick={handleClearNodeSelection}
                title="Deselect"
                className="flex items-center justify-center w-7 h-7 rounded border border-brand-border text-white/70 hover:text-white hover:border-white/20 transition-colors"
              >
                <X size={12} />
              </button>
            )}

            {/* Rarely-used graph-editing actions, tucked behind one menu
                instead of two standing icon buttons — the functionality is
                unchanged, just not competing for attention with Register
                Asset (see ViewControlsBar's "Display Options" for the same
                pattern). */}
            <div className="relative" ref={moreMenuRef}>
              <button
                onClick={() => setMoreMenuOpen((o) => !o)}
                title="More graph actions"
                className={`flex items-center justify-center w-7 h-7 rounded border transition-colors ${
                  moreMenuOpen ? 'bg-cyan/20 text-cyan border-cyan/40' : 'text-white/70 border-brand-border hover:text-white hover:border-white/20'
                }`}
              >
                <MoreHorizontal size={13} />
              </button>
              {moreMenuOpen && (
                <div className="absolute top-full right-0 mt-1.5 z-20 w-48 bg-brand-surface border border-brand-border rounded-lg shadow-xl py-1">
                  <button
                    onClick={() => { setAddEdgeModalOpen(true); setMoreMenuOpen(false) }}
                    disabled={nodes.length < 2}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-mono text-white/70 hover:bg-brand-surface-2 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-left"
                  >
                    <Link2 size={12} />
                    Add Edge
                  </button>
                  <button
                    onClick={() => { setCreateCustomModalOpen(true); setMoreMenuOpen(false) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-mono text-white/70 hover:bg-brand-surface-2 hover:text-white transition-colors text-left"
                  >
                    <Sparkles size={12} />
                    Create Custom Asset
                  </button>
                </div>
              )}
            </div>

            <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setConnectModalOpen(true)}>
              Register Asset
            </Button>
            <button
              onClick={() => setSidebarOpen((o) => !o)}
              title={sidebarOpen ? 'Hide Panels' : 'Show Panels'}
              className="flex items-center justify-center w-7 h-7 text-white/62 hover:text-white border border-brand-border rounded transition-colors"
            >
              {sidebarOpen ? <ChevronsLeft size={13} /> : <ChevronsRight size={13} />}
            </button>
          </div>
        </div>

        <ViewControlsBar
          layoutPreset={layoutPreset}
          onLayoutPreset={setLayoutPreset}
          nodeSizeMode={nodeSizeMode}
          onNodeSizeMode={setNodeSizeMode}
          colorMode={colorMode}
          onColorMode={setColorMode}
          showEdgeLabels={showEdgeLabels}
          onShowEdgeLabels={setShowEdgeLabels}
          showLegend={showLegend}
          onShowLegend={setShowLegend}
          onFullscreen={handleFullscreen}
        />

        <GraphFilterBar
          search={search}
          onSearchChange={setSearch}
          activeType={activeType}
          onTypeChange={setActiveType}
          activeHealth={activeHealth}
          onHealthChange={setActiveHealth}
          zone={zone}
          zones={zones}
          onZoneChange={setZone}
          onClearFilters={clearFilters}
        />

        <div ref={graphContainerRef} className="flex-1 flex overflow-hidden relative">
          {isFullscreen && (
            <button
              onClick={handleFullscreen}
              className="absolute top-3 right-3 z-30 flex items-center gap-1.5 rounded border border-brand-border bg-brand-surface/95 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-white/70 shadow-lg transition-colors hover:border-cyan/50 hover:text-cyan"
            >
              <Minimize size={13} />
              Exit fullscreen
            </button>
          )}
          <div className="order-2 flex-1 relative">
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-mono text-xs text-white/55 animate-pulse">Loading twin…</span>
              </div>
            ) : error ? (
              <ErrorState message={error} onRetry={load} />
            ) : (
              <FlowCanvas
                nodes={filteredNodes}
                edges={filteredEdges}
                zones={stationZones}
                onNodeClick={handleNodeSelect}
                onEdgeClick={(e) => setSelectedEdgeId(e.id)}
                selectedNodeId={selectedNode?.id ?? null}
                selectedEdgeId={selectedEdgeId}
                readOnly={false}
                showRelayoutButton
                className="w-full h-full"
                colorMode={colorMode}
                nodeSizeMode={nodeSizeMode}
                showEdgeLabels={showEdgeLabels}
                showLegend={showLegend}
                layoutPreset={layoutPreset}
                onEdgesUpdate={setEdges}
                onNodesUpdate={setNodes}
              />
            )}

            {selectedEdgeId && (() => {
              const edge = edges.find((e) => e.id === selectedEdgeId)
              if (!edge) return null
              const sourceNode = nodes.find((n) => n.id === edge.source)
              const targetNode = nodes.find((n) => n.id === edge.target)
              return (
                <EdgeActionBar
                  sourceLabel={sourceNode?.label ?? edge.source}
                  targetLabel={targetNode?.label ?? edge.target}
                  edgeType={edge.type}
                  onDelete={handleDeleteSelectedEdge}
                  onDeselect={() => setSelectedEdgeId(null)}
                />
              )
            })()}
          </div>

          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="absolute left-0 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-6 h-14 bg-brand-surface border border-brand-border border-l-0 rounded-r-md text-white/62 hover:text-cyan hover:bg-brand-surface/80 transition-colors shadow-lg"
            >
              <ChevronsRight size={14} />
            </button>
          )}

          {sidebarOpen && (
            <div className="order-1 w-[380px] shrink-0 border-r border-brand-border overflow-hidden bg-brand-surface">
              {inspectorOpen && selectedNode ? (
                <NodeInspector
                  node={selectedNode}
                  open={inspectorOpen}
                  onClose={handleClearNodeSelection}
                  allNodes={nodes}
                  onSelectNode={handleJumpToNode}
                  canRemove={true}
                  onRemoved={load}
                  embedded
                />
              ) : (
                <div className="h-full overflow-y-auto p-4 space-y-4">
                  <div className="bg-brand-bg border border-brand-border rounded p-4 flex flex-col">
                    <p className="font-mono text-[10px] text-white/62 uppercase tracking-widest mb-4">Station Health Overview</p>
                    <div className="flex items-center justify-center relative h-[140px] w-full min-w-0">
                      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                        <PieChart>
                          <Pie data={healthData} cx="50%" cy="50%" innerRadius={40} outerRadius={58} paddingAngle={2} dataKey="value" stroke="none">
                            {healthData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip content={<DarkTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-xl font-mono font-bold">{nodes.length}</span>
                        <span className="text-[10px] font-mono text-white/55 uppercase">Assets</span>
                      </div>
                    </div>
                  </div>

                  {simulatingNodes.length > 0 && (
                    <div className="bg-brand-bg border border-cyan/30 rounded p-4 flex flex-col">
                      <div className="flex items-center justify-between mb-3">
                        <p className="font-mono text-[10px] text-cyan uppercase tracking-widest">Simulating</p>
                        <span className="font-mono text-[10px] text-cyan">{simulatingNodes.length}</span>
                      </div>
                      <div className="space-y-1">
                        {simulatingNodes.slice(0, 6).map((n) => (
                          <div key={n.id} className="flex items-center text-xs font-sans p-1.5 hover:bg-brand-surface rounded group cursor-pointer transition-colors" onClick={() => handleNodeSelect(n)}>
                            <span className="mr-1.5 shrink-0"><span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan animate-pulse" /></span>
                            <span className="flex-1 truncate group-hover:text-cyan transition-colors">{n.label}</span>
                            <span className="font-mono text-white/55 text-[10px]">SIM</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {criticalNodes.length > 0 && (
                    <div className="bg-brand-bg border border-crimson/30 rounded p-4 flex flex-col">
                      <div className="flex items-center justify-between mb-3">
                        <p className="font-mono text-[10px] text-crimson uppercase tracking-widest">Critical / Offline</p>
                        <span className="font-mono text-[10px] text-crimson">{criticalNodes.length}</span>
                      </div>
                      <div className="space-y-1">
                        {criticalNodes.map((n) => (
                          <div key={n.id} className="flex items-center text-xs font-sans p-1.5 hover:bg-brand-surface rounded group cursor-pointer transition-colors" onClick={() => handleNodeSelect(n)}>
                            <span className="mr-1.5 shrink-0"><span className={`inline-block w-1.5 h-1.5 rounded-full ${n.health === 'unreachable' ? 'bg-white/30' : 'bg-crimson shadow-crimson-glow'}`} /></span>
                            <span className="flex-1 truncate group-hover:text-cyan transition-colors">{n.label}</span>
                            <span className="font-mono text-crimson">{n.healthScore}</span>
                            <span className="font-mono text-[10px] ml-1.5" style={{ color: weightedRiskColor(computeWeightedRisk(n.healthScore, n.type)) }}>
                              W:{computeWeightedRisk(n.healthScore, n.type).toFixed(0)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="bg-brand-bg border border-brand-border rounded p-4 flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-mono text-[10px] text-white/62 uppercase tracking-widest">At Risk</p>
                      <span className="font-mono text-[10px] text-amber">{atRiskNodes.length}</span>
                    </div>
                    <div className="space-y-1">
                      {atRiskNodes.length === 0 ? (
                        <p className="text-xs font-mono text-emerald py-4 text-center">No degraded assets</p>
                      ) : (
                        atRiskNodes.map((n) => (
                          <div key={n.id} className="flex items-center text-xs font-sans p-1.5 hover:bg-brand-surface rounded group cursor-pointer transition-colors" onClick={() => handleNodeSelect(n)}>
                            <span className="mr-1.5 shrink-0"><span className="inline-block w-1.5 h-1.5 rounded-full bg-amber" /></span>
                            <span className="flex-1 truncate group-hover:text-cyan transition-colors">{n.label}</span>
                            <span className="font-mono text-amber">{n.healthScore}</span>
                            <span className="font-mono text-[10px] ml-1.5" style={{ color: weightedRiskColor(computeWeightedRisk(n.healthScore, n.type)) }}>
                              W:{computeWeightedRisk(n.healthScore, n.type).toFixed(0)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="bg-brand-bg border border-brand-border rounded p-4 flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-mono text-[10px] text-white/62 uppercase tracking-widest">Zones</p>
                      <Badge variant="neutral" size="sm">{zones.length}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {zones.map((z) => (
                        <button
                          key={z}
                          onClick={() => setZone(z === zone ? '' : z)}
                          className={`text-[10px] font-mono rounded px-2 py-1 border transition-colors ${z === zone ? 'bg-cyan/10 border-cyan/40 text-cyan' : 'border-brand-border text-white/70 hover:text-white'}`}
                        >
                          {z}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ConnectNodeModal open={connectModalOpen} onClose={() => setConnectModalOpen(false)} onCreated={load} />
      <CreateCustomNodeModal open={createCustomModalOpen} onClose={() => setCreateCustomModalOpen(false)} onCreated={load} />
      <AddEdgeModal open={addEdgeModalOpen} onClose={() => setAddEdgeModalOpen(false)} nodes={nodes} existingEdges={edges} onAdd={handleAddEdge} />
    </>
  )
}
