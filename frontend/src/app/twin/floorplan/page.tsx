'use client'

// Room-Wise Floor Plan — a third way of looking at the twin (alongside the
// dependency graph at /twin and the 3D placeholder at /twin/3d): each real
// room/zone rendered as a labelled box, grouped by Bharati's 4 real floors
// or Maitri's Main Building / Outdoor Facilities split (same architecture
// the 2D graph's zone bands use — lib/graph/zoneLayout.ts — grouped here
// into rooms instead of graph positions, via lib/graph/floorPlan.ts).
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Fuel, AlertTriangle, Truck, Lock, Thermometer, Zap, Droplets, Users, Bell, Gauge, X } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { InlineLoader, ErrorState } from '@/components/ui/Loader'
import { NodeInspector } from '@/components/graph/NodeInspector'
import { graphService } from '@/services/graph.service'
import { logisticsService } from '@/services/logistics.service'
import { alertsService } from '@/services/alerts.service'
import { riskService } from '@/services/risk.service'
import { useStationStore } from '@/store/useStationStore'
import { HEALTH_COLORS } from '@/lib/constants'
import { canUseFloorPlan, computeFloorPlanSections, type FloorPlanRoom } from '@/lib/graph/floorPlan'
import type { GraphNode } from '@/types/graph'
import type { BackendAlertDetail } from '@/lib/backendAdapters'

type OverlayMode = 'power' | 'thermal' | 'water_waste' | 'occupancy' | 'alerts' | 'risk'

const OVERLAY_MODES: Array<{ id: OverlayMode; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { id: 'power', label: 'Power', icon: Zap },
  { id: 'thermal', label: 'Thermal', icon: Thermometer },
  { id: 'water_waste', label: 'Water / Waste', icon: Droplets },
  { id: 'occupancy', label: 'Occupancy', icon: Users },
  { id: 'alerts', label: 'Alerts', icon: Bell },
  { id: 'risk', label: 'Risk', icon: Gauge },
]

const NEUTRAL = '#8A8576'

function avgHealthColor(assets: GraphNode[]): { color: string; value: string } {
  if (assets.length === 0) return { color: NEUTRAL, value: 'n/a' }
  const avg = assets.reduce((s, a) => s + a.healthScore, 0) / assets.length
  const color = avg >= 80 ? HEALTH_COLORS.healthy : avg >= 50 ? HEALTH_COLORS.degraded : HEALTH_COLORS.critical
  return { color, value: `${Math.round(avg)}` }
}

export default function FloorPlanPage() {
  const station = useStationStore((s) => s.station)
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [zones, setZones] = useState<Parameters<typeof computeFloorPlanSections>[1]>([])
  const [openAlerts, setOpenAlerts] = useState<BackendAlertDetail[]>([])
  const [activeConvoys, setActiveConvoys] = useState(0)
  const [fuelDays, setFuelDays] = useState<number | null>(null)
  const [riskBySubsystem, setRiskBySubsystem] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [sectionKey, setSectionKey] = useState<string | null>(null)
  const [overlay, setOverlay] = useState<OverlayMode>('power')
  const [selectedRoom, setSelectedRoom] = useState<FloorPlanRoom | null>(null)
  const [selectedAsset, setSelectedAsset] = useState<GraphNode | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [graph, zoneList, endurance, alerts, convoys, risk] = await Promise.allSettled([
        graphService.getLiveGraph(station),
        graphService.getZones(station),
        logisticsService.getEndurance(station),
        alertsService.list({ station, state: 'open' }),
        logisticsService.getConvoys(station),
        riskService.getHeatmap(station),
      ])
      setNodes(graph.status === 'fulfilled' ? graph.value.nodes : [])
      setZones(zoneList.status === 'fulfilled' ? zoneList.value : [])
      setFuelDays(endurance.status === 'fulfilled' ? endurance.value.fuel_days_remaining : null)
      setOpenAlerts(alerts.status === 'fulfilled' ? alerts.value : [])
      setActiveConvoys(convoys.status === 'fulfilled' ? convoys.value.filter((c) => c.status === 'underway').length : 0)
      setRiskBySubsystem(risk.status === 'fulfilled' ? new Map(risk.value.cells.map((c) => [c.subsystem, c.score])) : new Map())
      if (graph.status === 'rejected') setError('Twin backend unavailable')
    } finally {
      setLoading(false)
    }
  }, [station])

  useEffect(() => { load() }, [load])

  const sections = useMemo(() => (canUseFloorPlan(nodes, zones) ? computeFloorPlanSections(nodes, zones) : []), [nodes, zones])
  const activeSection = sections.find((s) => s.key === sectionKey) ?? sections[0] ?? null

  useEffect(() => {
    if (sections.length > 0 && !sections.some((s) => s.key === sectionKey)) setSectionKey(sections[0].key)
  }, [sections, sectionKey])

  const openAlertsByAsset = useMemo(() => {
    const map = new Map<string, BackendAlertDetail[]>()
    for (const a of openAlerts) {
      if (!map.has(a.asset_id)) map.set(a.asset_id, [])
      map.get(a.asset_id)!.push(a)
    }
    return map
  }, [openAlerts])

  function overlayFor(room: FloorPlanRoom): { color: string; value: string; hint: string } {
    switch (overlay) {
      case 'power': {
        const r = avgHealthColor(room.assets.filter((a) => a.type === 'power'))
        return { ...r, hint: 'Avg. health of power assets in this room' }
      }
      case 'thermal': {
        // No literal per-room temperature sensor in this data model — the
        // heating-category asset's health is the closest live proxy
        // (falls back to overall room health so every room still reads).
        const heating = room.assets.filter((a) => a.type === 'heating')
        const r = avgHealthColor(heating.length > 0 ? heating : room.assets)
        return { ...r, hint: heating.length > 0 ? 'Avg. health of heating assets' : 'No heating asset — showing overall room health' }
      }
      case 'water_waste': {
        const r = avgHealthColor(room.assets.filter((a) => a.type === 'water' || a.type === 'waste'))
        return { ...r, hint: 'Avg. health of water/waste assets in this room' }
      }
      case 'occupancy': {
        // No live occupancy sensors — informational only (asset density as
        // a rough proxy for "a room people actively work in").
        return { color: NEUTRAL, value: String(room.assets.length), hint: 'No live occupancy sensor — asset count shown for reference' }
      }
      case 'alerts': {
        const sevs = room.assets.flatMap((a) => openAlertsByAsset.get(a.id) ?? [])
        if (sevs.length === 0) return { color: HEALTH_COLORS.healthy, value: '0', hint: 'No open alerts' }
        const worst = sevs.some((s) => s.severity === 'critical' || s.severity === 'emergency') ? HEALTH_COLORS.critical
          : sevs.some((s) => s.severity === 'warning') ? HEALTH_COLORS.degraded : HEALTH_COLORS.simulating
        return { color: worst, value: String(sevs.length), hint: `${sevs.length} open alert(s)` }
      }
      case 'risk': {
        const cats = [...new Set(room.assets.map((a) => a.type))]
        const scores = cats.map((c) => riskBySubsystem.get(c)).filter((v): v is number => v != null)
        if (scores.length === 0) return { color: NEUTRAL, value: 'n/a', hint: 'No risk cell for this room’s asset categories' }
        const max = Math.max(...scores)
        const color = max >= 70 ? HEALTH_COLORS.critical : max >= 40 ? HEALTH_COLORS.degraded : HEALTH_COLORS.healthy
        return { color, value: `${Math.round(max)}`, hint: 'Highest subsystem risk score among this room’s asset categories' }
      }
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-brand-bg p-6">
      <div className="max-w-6xl mx-auto space-y-5">
        <div>
          <h1 className="font-mono text-sm font-bold text-white uppercase tracking-widest">
            Floor Plan — {station.toUpperCase()}
          </h1>
          <p className="text-white/40 text-xs mt-1 font-sans">
            Every room as a box, colored by the selected overlay. Click a room to see what&rsquo;s inside it.
          </p>
        </div>

        {loading && <div className="flex justify-center py-16"><InlineLoader text="Loading floor plan…" /></div>}
        {error && !loading && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && (
          <>
            {/* Stat strip */}
            <div className="grid grid-cols-3 gap-3">
              <div className="relative overflow-hidden rounded-lg border p-3.5" style={{ borderColor: '#3A3AB840', background: 'linear-gradient(155deg, #3A3AB814 0%, #3A3AB804 100%)' }}>
                <p className="font-mono text-[9px] text-white/40 uppercase tracking-widest flex items-center gap-1"><Fuel size={10} /> Fuel Endurance</p>
                <p className="font-mono text-xl font-bold text-white mt-1">{fuelDays ?? '—'} <span className="text-[10px] text-white/40">days</span></p>
              </div>
              <div className="relative overflow-hidden rounded-lg border p-3.5" style={{ borderColor: '#C23B3B40', background: 'linear-gradient(155deg, #C23B3B14 0%, #C23B3B04 100%)' }}>
                <p className="font-mono text-[9px] text-white/40 uppercase tracking-widest flex items-center gap-1"><AlertTriangle size={10} /> Open Alerts</p>
                <p className="font-mono text-xl font-bold text-white mt-1">{openAlerts.length}</p>
              </div>
              <div className="relative overflow-hidden rounded-lg border p-3.5" style={{ borderColor: '#0F8A6A40', background: 'linear-gradient(155deg, #0F8A6A14 0%, #0F8A6A04 100%)' }}>
                <p className="font-mono text-[9px] text-white/40 uppercase tracking-widest flex items-center gap-1"><Truck size={10} /> Active Convoys</p>
                <p className="font-mono text-xl font-bold text-white mt-1">{activeConvoys}</p>
              </div>
            </div>

            {/* Station-area picker */}
            {sections.length > 0 && (
              <div className="flex items-center gap-1.5 bg-brand-surface-2 border border-brand-border rounded-lg p-1 w-fit overflow-x-auto">
                {sections.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setSectionKey(s.key)}
                    className={`px-3 py-1.5 rounded-md font-mono text-[10px] uppercase tracking-wider whitespace-nowrap transition-colors ${
                      activeSection?.key === s.key ? 'bg-cyan text-brand-bg font-bold' : 'text-white/50 hover:text-white hover:bg-brand-surface-3'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}

            {/* Overlay picker */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {OVERLAY_MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setOverlay(m.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border font-mono text-[10px] uppercase tracking-wider transition-colors ${
                    overlay === m.id ? 'border-cyan/50 bg-cyan/10 text-cyan' : 'border-brand-border text-white/50 hover:text-white hover:border-white/30'
                  }`}
                >
                  <m.icon size={11} />
                  {m.label}
                </button>
              ))}
            </div>

            {/* Room grid */}
            {sections.length === 0 ? (
              <ErrorState message="No zone data available to build a floor plan for this station." onRetry={load} />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {activeSection?.rooms.map((room) => {
                  const { color, value, hint } = overlayFor(room)
                  return (
                    <button
                      key={room.zoneId}
                      title={hint}
                      onClick={() => setSelectedRoom(room)}
                      className="group relative flex flex-col justify-between h-28 rounded-lg border p-3 text-left overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg"
                      style={{ borderColor: `${color}66`, background: `linear-gradient(160deg, ${color}22 0%, ${color}08 100%)` }}
                    >
                      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: color }} />
                      <div className="flex items-start justify-between gap-1">
                        <span className="font-mono text-[10.5px] font-semibold text-white leading-tight">{room.name}</span>
                        {room.restricted && <Lock size={11} className="text-amber shrink-0 mt-0.5" />}
                      </div>
                      <div className="flex items-end justify-between">
                        <span className="font-mono text-[9px] text-white/40">{room.assets.length} asset{room.assets.length === 1 ? '' : 's'}</span>
                        <span className="font-mono text-lg font-bold" style={{ color }}>{value}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Room detail side panel */}
      {selectedRoom && (
        <div className="fixed inset-0 z-40 flex justify-end" onClick={() => setSelectedRoom(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
          <div className="relative w-[360px] h-full bg-brand-surface border-l border-brand-border shadow-2xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-brand-border sticky top-0 bg-brand-surface">
              <div>
                <h2 className="font-mono text-sm font-semibold text-white">{selectedRoom.name}</h2>
                <p className="font-mono text-[9px] text-white/30 uppercase tracking-wider mt-0.5">
                  {selectedRoom.kind}{selectedRoom.restricted ? ' · restricted' : ''}{selectedRoom.floor != null ? ` · floor ${selectedRoom.floor}` : ''}
                </p>
              </div>
              <button onClick={() => setSelectedRoom(null)} className="text-white/40 hover:text-white"><X size={16} /></button>
            </div>
            <div className="p-4 space-y-1.5">
              {selectedRoom.assets.length === 0 ? (
                <p className="text-xs font-mono text-white/30 italic">No assets tagged to this room.</p>
              ) : (
                selectedRoom.assets.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedAsset(a)}
                    className="w-full flex items-center justify-between text-left p-2.5 rounded hover:bg-brand-surface-2 transition-colors group"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: HEALTH_COLORS[a.health] }} />
                      <span className="text-xs font-sans text-white/80 truncate group-hover:text-cyan">{a.label}</span>
                    </span>
                    <Badge variant={a.health === 'healthy' ? 'healthy' : a.health === 'critical' ? 'critical' : a.health === 'unreachable' ? 'neutral' : 'warning'} size="sm">
                      {a.healthScore}
                    </Badge>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {selectedAsset && (
        <NodeInspector
          node={selectedAsset}
          open={Boolean(selectedAsset)}
          onClose={() => setSelectedAsset(null)}
          allNodes={nodes}
          onSelectNode={(id) => setSelectedAsset(nodes.find((n) => n.id === id) ?? null)}
        />
      )}
    </div>
  )
}
