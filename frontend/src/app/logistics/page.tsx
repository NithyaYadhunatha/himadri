'use client'

// Logistics — the supply-chain side of Operations, split out of what used
// to be one combined "Energy & Logistics" page: vehicle fleet, convoy
// planning, and food/spares inventory. The power-generation side (fuel,
// generators/CHP, endurance, carbon) lives on /energy.
import { useState, useEffect, useCallback } from 'react'
import { Package, Truck, Users, Plus, Send } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ErrorState, InlineLoader, EmptyState } from '@/components/ui/Loader'
import { logisticsService, type InventoryItem, type Vehicle, type Convoy } from '@/services/logistics.service'
import { useStationStore } from '@/store/useStationStore'

export default function LogisticsPage() {
  const station = useStationStore((s) => s.station)
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [convoys, setConvoys] = useState<Convoy[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [convoyName, setConvoyName] = useState('')
  const [creatingConvoy, setCreatingConvoy] = useState(false)
  const [departError, setDepartError] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [inv, veh, conv] = await Promise.allSettled([
        logisticsService.getInventory(station),
        logisticsService.getVehicles(station),
        logisticsService.getConvoys(station),
      ])
      setInventory(inv.status === 'fulfilled' ? inv.value.filter((i) => i.category !== 'fuel') : [])
      setVehicles(veh.status === 'fulfilled' ? veh.value : [])
      setConvoys(conv.status === 'fulfilled' ? conv.value : [])
      if (inv.status === 'rejected' && veh.status === 'rejected' && conv.status === 'rejected') {
        setError('Logistics backend unavailable')
      }
    } finally {
      setLoading(false)
    }
  }, [station])

  useEffect(() => { load() }, [load])

  const handleCreateConvoy = async () => {
    if (!convoyName.trim()) return
    setCreatingConvoy(true)
    try {
      await logisticsService.createConvoy({ station_id: station, name: convoyName.trim() })
      setConvoyName('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create convoy')
    } finally {
      setCreatingConvoy(false)
    }
  }

  const handleDepart = async (id: string) => {
    setDepartError((prev) => ({ ...prev, [id]: '' }))
    try {
      await logisticsService.departConvoy(id)
      await load()
    } catch (err) {
      setDepartError((prev) => ({ ...prev, [id]: err instanceof Error ? err.message : 'Failed to depart' }))
    }
  }

  return (
    <div className="h-screen overflow-y-auto bg-brand-bg p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="font-mono text-sm font-bold text-white uppercase tracking-widest">
            Logistics — {station.toUpperCase()}
          </h1>
          <p className="text-white/40 text-xs mt-1 font-sans">Food/spares inventory, vehicle fleet, and convoy planning.</p>
        </div>

        {loading && <div className="flex justify-center py-16"><InlineLoader text="Loading logistics data…" /></div>}
        {error && !loading && <ErrorState message={error} onRetry={load} />}

        {!loading && (
          <>
            <section>
              <h2 className="font-mono text-xs text-white/50 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Package size={13} /> Inventory (Food / Spares)
              </h2>
              {inventory.length === 0 ? (
                <EmptyState message="No inventory records" />
              ) : (
                <div className="bg-brand-surface border border-brand-border rounded overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-brand-bg text-white/40 font-mono uppercase text-[10px]">
                      <tr><th className="text-left px-3 py-2">Item</th><th className="text-left px-3 py-2">Category</th><th className="text-right px-3 py-2">Quantity</th><th className="text-right px-3 py-2">Reorder At</th></tr>
                    </thead>
                    <tbody>
                      {inventory.map((item) => (
                        <tr key={item.id} className="border-t border-brand-border">
                          <td className="px-3 py-2 text-white/80">{item.name}</td>
                          <td className="px-3 py-2 text-white/50 font-mono">{item.category}</td>
                          <td className={`px-3 py-2 text-right font-mono ${item.reorder_threshold !== null && item.quantity <= item.reorder_threshold ? 'text-crimson' : 'text-white/70'}`}>
                            {item.quantity} {item.unit}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-white/30">{item.reorder_threshold ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section>
              <h2 className="font-mono text-xs text-white/50 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Truck size={13} /> Vehicle Fleet
              </h2>
              {vehicles.length === 0 ? (
                <EmptyState message="No vehicles registered" />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {vehicles.map((v) => (
                    <div key={v.id} className="bg-brand-surface border border-brand-border rounded p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-sans text-white">{v.name}</span>
                        <Badge variant={v.status === 'operational' || v.status === 'ready' ? 'healthy' : 'warning'} size="sm">{v.status}</Badge>
                      </div>
                      <p className="font-mono text-[10px] text-white/40 uppercase">{v.vehicle_type}</p>
                      <div className="flex gap-3 mt-2 text-[10px] font-mono text-white/50">
                        {v.fuel_level_percent !== null && <span>Fuel {v.fuel_level_percent}%</span>}
                        {v.run_hours !== null && <span>{v.run_hours}h</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="font-mono text-xs text-white/50 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Users size={13} /> Convoy Planner
              </h2>
              <div className="flex gap-2 mb-3">
                <input
                  value={convoyName}
                  onChange={(e) => setConvoyName(e.target.value)}
                  placeholder="New convoy name…"
                  className="flex-1 max-w-xs bg-brand-surface border border-brand-border rounded px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-cyan/60"
                />
                <Button variant="primary" size="sm" icon={<Plus size={13} />} loading={creatingConvoy} onClick={handleCreateConvoy}>
                  New Convoy
                </Button>
              </div>

              {convoys.length === 0 ? (
                <EmptyState message="No convoys planned" />
              ) : (
                <div className="space-y-3">
                  {convoys.map((c) => (
                    <div key={c.id} className="bg-brand-surface border border-brand-border rounded p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-sans font-medium text-white">{c.name}</span>
                        <Badge variant={c.status === 'departed' ? 'healthy' : 'neutral'} size="sm">{c.status}</Badge>
                      </div>
                      <div className="flex items-center gap-4 text-[10px] font-mono text-white/40 mb-2">
                        <span>{c.vehicle_ids.length} vehicle(s)</span>
                        <span>{c.members.length} member(s)</span>
                        <span className={c.has_medical_officer ? 'text-emerald' : 'text-amber'}>
                          {c.has_medical_officer ? 'Medical officer assigned' : 'No medical officer'}
                        </span>
                        <span className={c.has_ambulance_escort ? 'text-emerald' : 'text-amber'}>
                          {c.has_ambulance_escort ? 'Ambulance escort' : 'No ambulance escort'}
                        </span>
                      </div>
                      {c.status !== 'departed' && (
                        <div className="flex items-center gap-2">
                          <Button variant="secondary" size="sm" icon={<Send size={12} />} onClick={() => handleDepart(c.id)}>
                            Depart
                          </Button>
                          {departError[c.id] && (
                            <span className="text-[11px] font-mono text-crimson">{departError[c.id]}</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
