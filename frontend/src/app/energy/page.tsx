'use client'

// Energy — the power-generation side of Operations, split out of what used
// to be one combined "Energy & Logistics" page: generators/CHP/power assets,
// fuel inventory, endurance projection, and carbon output. Supply-chain
// concerns (vehicles, convoys, food/spares inventory) live on /logistics.
import { useState, useEffect, useCallback } from 'react'
import { Fuel, Zap, Cloud, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { ErrorState, InlineLoader, EmptyState } from '@/components/ui/Loader'
import { logisticsService, type InventoryItem, type EnduranceProjection } from '@/services/logistics.service'
import { graphService } from '@/services/graph.service'
import type { GraphNode } from '@/types/graph'
import { useStationStore } from '@/store/useStationStore'
import { HEALTH_COLORS } from '@/lib/constants'

function EnduranceCard({ endurance }: { endurance: EnduranceProjection | null }) {
  if (!endurance) return null
  const worst = Math.min(endurance.fuel_days_remaining, endurance.food_days_remaining)
  const color = worst < 30 ? '#B23A2E' : worst < 90 ? '#B8720F' : '#1F9E6D'
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="relative overflow-hidden rounded-lg p-4 border" style={{ borderColor: '#1868A040', background: 'linear-gradient(155deg, #1868A014 0%, #1868A004 100%)' }}>
        <p className="font-mono text-[10px] text-white/40 uppercase tracking-widest mb-1">Fuel Endurance</p>
        <p className="font-mono text-2xl font-bold" style={{ color: endurance.fuel_days_remaining < 30 ? '#B23A2E' : '#1F9E6D' }}>
          {endurance.fuel_days_remaining} <span className="text-xs text-white/40">days</span>
        </p>
      </div>
      <div className="relative overflow-hidden rounded-lg p-4 border" style={{ borderColor: '#1F9E6D40', background: 'linear-gradient(155deg, #1F9E6D14 0%, #1F9E6D04 100%)' }}>
        <p className="font-mono text-[10px] text-white/40 uppercase tracking-widest mb-1">Food Endurance</p>
        <p className="font-mono text-2xl font-bold" style={{ color: endurance.food_days_remaining < 30 ? '#B23A2E' : '#1F9E6D' }}>
          {endurance.food_days_remaining} <span className="text-xs text-white/40">days</span>
        </p>
      </div>
      <div className="col-span-2 flex items-center gap-2 text-[10px] font-mono" style={{ color }}>
        <AlertTriangle size={11} />
        Computed {new Date(endurance.computed_at).toLocaleString()}
      </div>
    </div>
  )
}

export default function EnergyPage() {
  const station = useStationStore((s) => s.station)
  const [fuelInventory, setFuelInventory] = useState<InventoryItem[]>([])
  const [endurance, setEndurance] = useState<EnduranceProjection | null>(null)
  const [carbonKg, setCarbonKg] = useState<number | null>(null)
  const [powerAssets, setPowerAssets] = useState<GraphNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [inv, end, carbon, graph] = await Promise.allSettled([
        logisticsService.getInventory(station),
        logisticsService.getEndurance(station),
        logisticsService.getDailyCarbonKg(station),
        graphService.getLiveGraph(station),
      ])
      setFuelInventory(inv.status === 'fulfilled' ? inv.value.filter((i) => i.category === 'fuel') : [])
      setEndurance(end.status === 'fulfilled' ? end.value : null)
      setCarbonKg(carbon.status === 'fulfilled' ? carbon.value : null)
      setPowerAssets(graph.status === 'fulfilled' ? graph.value.nodes.filter((n) => n.type === 'power') : [])
      if (inv.status === 'rejected' && end.status === 'rejected' && graph.status === 'rejected') {
        setError('Energy backend unavailable')
      }
    } finally {
      setLoading(false)
    }
  }, [station])

  useEffect(() => { load() }, [load])

  return (
    <div className="h-screen overflow-y-auto bg-brand-bg p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="font-mono text-sm font-bold text-white uppercase tracking-widest">
            Energy — {station.toUpperCase()}
          </h1>
          <p className="text-white/40 text-xs mt-1 font-sans">Generators/CHP power assets, fuel burn, endurance projection, and carbon output.</p>
        </div>

        {loading && <div className="flex justify-center py-16"><InlineLoader text="Loading energy data…" /></div>}
        {error && !loading && <ErrorState message={error} onRetry={load} />}

        {!loading && (
          <>
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <h2 className="font-mono text-xs text-white/50 uppercase tracking-widest mb-3">Endurance Projection</h2>
                {endurance ? <EnduranceCard endurance={endurance} /> : <EmptyState message="No endurance projection available" />}
              </div>
              <div>
                <h2 className="font-mono text-xs text-white/50 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <Cloud size={13} /> Carbon Output
                </h2>
                <div className="relative overflow-hidden rounded-lg p-4 border h-[calc(100%-1.75rem)] flex flex-col justify-center" style={{ borderColor: '#16283A20', background: 'linear-gradient(155deg, #16283A0c 0%, #16283A02 100%)' }}>
                  {carbonKg != null ? (
                    <>
                      <p className="font-mono text-[10px] text-white/40 uppercase tracking-widest mb-1">Est. Daily Output</p>
                      <p className="font-mono text-2xl font-bold text-white">{(carbonKg / 1000).toFixed(2)} <span className="text-xs text-white/40">t CO2e/day</span></p>
                    </>
                  ) : (
                    <p className="text-[11px] font-mono text-white/30 italic">No carbon telemetry available from the live backend yet.</p>
                  )}
                </div>
              </div>
            </section>

            <section>
              <h2 className="font-mono text-xs text-white/50 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Zap size={13} /> Generators / CHP / Power Assets
              </h2>
              {powerAssets.length === 0 ? (
                <EmptyState message="No power assets found" />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {powerAssets.map((a) => (
                    <div key={a.id} className="relative overflow-hidden rounded-lg border border-brand-border bg-brand-surface p-3">
                      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: HEALTH_COLORS[a.health], opacity: a.isSimulating ? 0.5 : a.healthScore / 100 }} />
                      <div className="flex items-center justify-between mb-1 mt-1">
                        <span className="text-sm font-sans text-white">{a.label}</span>
                        <Badge variant={a.health === 'healthy' ? 'healthy' : a.health === 'critical' ? 'critical' : a.health === 'unreachable' ? 'neutral' : 'warning'} size="sm">{a.health}</Badge>
                      </div>
                      <p className="font-mono text-[10px] text-white/40 uppercase">{a.subtype ?? a.type}</p>
                      <p className="font-mono text-xs mt-1" style={{ color: HEALTH_COLORS[a.health] }}>{a.healthScore} health</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="font-mono text-xs text-white/50 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Fuel size={13} /> Fuel Inventory
              </h2>
              {fuelInventory.length === 0 ? (
                <EmptyState message="No fuel inventory records" />
              ) : (
                <div className="bg-brand-surface border border-brand-border rounded overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-brand-surface-2 text-white/40 font-mono uppercase text-[10px]">
                      <tr><th className="text-left px-3 py-2">Item</th><th className="text-right px-3 py-2">Quantity</th><th className="text-right px-3 py-2">Reorder At</th></tr>
                    </thead>
                    <tbody>
                      {fuelInventory.map((item) => (
                        <tr key={item.id} className="border-t border-brand-border">
                          <td className="px-3 py-2 text-white/80">{item.name}</td>
                          <td className={`px-3 py-2 text-right font-mono ${item.reorder_threshold !== null && item.quantity <= item.reorder_threshold ? 'text-crimson' : 'text-white/70'}`}>
                            {item.quantity.toLocaleString()} {item.unit}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-white/30">{item.reorder_threshold?.toLocaleString() ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
