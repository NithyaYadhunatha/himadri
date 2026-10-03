'use client'

// Logistics — the supply-chain side of Operations: manual stock entry (counts,
// deliveries, daily consumption, expected resupply), food/water outlook from the
// forecast model, vehicle fleet, and convoy planning. Power/fuel lives on /energy.
//
// Logistics data is entered by people, not sensors, so the top of this page is a
// structured entry desk with an audit-style activity log and CSV export.
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Package, Truck, Users, Plus, Send, ClipboardList, Flame, CalendarClock, Download, Trash2,
  Wheat, Droplets, Gauge, AlertTriangle, RefreshCw, History,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ErrorState, InlineLoader, EmptyState } from '@/components/ui/Loader'
import { PageShell, PageHeader, Panel, MetricTile, SegTabs, Bar, SyntheticChip, inputClass, labelClass } from '@/components/ui/Panel'
import { BandChart, type BandPoint } from '@/components/forecast/ForecastCharts'
import { logisticsService, type InventoryItem, type Vehicle, type Convoy } from '@/services/logistics.service'
import { useStationStore } from '@/store/useStationStore'
import { useLedgerStore, ledgerToCsv, type LedgerResource } from '@/store/useLedgerStore'
import { useForecastModel } from '@/lib/forecast/useForecastModel'
import { buildOutlook, endurance_color, fmtDate, fmtDays, todayUtc } from '@/lib/forecast/outlook'
import { projectConsumption, isoDate } from '@/lib/forecast/engine'
import { STATION_LABELS } from '@/lib/constants'
import { CHART, fmtNum, healthColor } from '@/lib/chartTheme'

type EntryTab = 'count' | 'delivery' | 'consumption' | 'resupply' | 'item'

const TAB_META: Array<{ value: EntryTab; label: string }> = [
  { value: 'count', label: 'Stock count' },
  { value: 'delivery', label: 'Receive delivery' },
  { value: 'consumption', label: 'Daily use' },
  { value: 'resupply', label: 'Expected resupply' },
  { value: 'item', label: 'New item' },
]

const KIND_LABEL: Record<string, string> = { count: 'Count', delivery: 'Delivery', consumption: 'Daily use', adjustment: 'Adjustment' }
const KIND_COLOR: Record<string, string> = { count: CHART.blue, delivery: CHART.green, consumption: CHART.amber, adjustment: CHART.violet }

function ageDays(iso: string | null): number | null {
  return iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null
}

// ─── Manual entry desk ──────────────────────────────────────────────────────

function EntryDesk({ station, inventory, onChanged }: { station: string; inventory: InventoryItem[]; onChanged: () => void }) {
  const addEntry = useLedgerStore((s) => s.addEntry)
  const addDelivery = useLedgerStore((s) => s.addDelivery)
  const [tab, setTab] = useState<EntryTab>('count')
  const [itemId, setItemId] = useState('')
  const [qty, setQty] = useState('')
  const [date, setDate] = useState(isoDate(new Date()))
  const [by, setBy] = useState('')
  const [note, setNote] = useState('')
  const [resource, setResource] = useState<LedgerResource>('fuel')
  const [deduct, setDeduct] = useState(false)
  const [label, setLabel] = useState('Ship resupply')
  const [newName, setNewName] = useState('')
  const [newCat, setNewCat] = useState('food')
  const [newUnit, setNewUnit] = useState('kg')
  const [reorder, setReorder] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const item = inventory.find((i) => i.id === (itemId || inventory[0]?.id))
  const n = Number(qty)
  const valid = tab === 'item' ? newName.trim().length > 1 && n >= 0 && qty !== '' : qty !== '' && n >= 0 && (tab === 'consumption' || tab === 'resupply' || !!item)

  const reset = () => { setQty(''); setNote('') }

  const submit = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const base = { station, date, by: by.trim() || undefined, note: note.trim() || undefined }
      if (tab === 'count' && item) {
        await logisticsService.logCount(item.id, n)
        addEntry({ ...base, kind: 'count', resource: item.category as LedgerResource, itemId: item.id, itemName: item.name, quantity: n, unit: item.unit })
        setMsg({ ok: true, text: `${item.name} counted at ${fmtNum(n)} ${item.unit}.` })
      } else if (tab === 'delivery' && item) {
        await logisticsService.logCount(item.id, item.quantity + n)
        addEntry({ ...base, kind: 'delivery', resource: item.category as LedgerResource, itemId: item.id, itemName: item.name, quantity: n, unit: item.unit })
        setMsg({ ok: true, text: `Received ${fmtNum(n)} ${item.unit}; ${item.name} is now ${fmtNum(item.quantity + n)} ${item.unit}.` })
      } else if (tab === 'consumption') {
        const unit = resource === 'fuel' || resource === 'water' ? 'L' : 'kg'
        const target = deduct ? inventory.find((i) => i.id === itemId && i.category === resource) : undefined
        if (target) await logisticsService.logCount(target.id, Math.max(0, target.quantity - n))
        addEntry({ ...base, kind: 'consumption', resource, itemId: target?.id, itemName: target?.name, quantity: n, unit })
        setMsg({ ok: true, text: `Logged ${fmtNum(n)} ${unit} of ${resource} used on ${date}${target ? ` and deducted from ${target.name}` : ''}.` })
      } else if (tab === 'resupply') {
        addDelivery({ station, date, resource: resource === 'food' ? 'food' : 'fuel', amount: n, label: label.trim() || 'Resupply' })
        setMsg({ ok: true, text: `Expected ${fmtNum(n)} ${resource === 'food' ? 'kg' : 'L'} on ${date} — the run-out forecast now includes it.` })
      } else if (tab === 'item') {
        const created = await logisticsService.createItem({
          station_id: station, category: newCat, name: newName.trim(), unit: newUnit, quantity: n,
          reorder_threshold: reorder === '' ? null : Number(reorder),
        })
        addEntry({ ...base, kind: 'adjustment', resource: newCat as LedgerResource, itemId: created.id, itemName: created.name, quantity: n, unit: newUnit, note: note.trim() || 'New stock line created' })
        setNewName('')
        setMsg({ ok: true, text: `Added “${created.name}” to inventory.` })
      }
      reset()
      onChanged()
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not save entry' })
    } finally {
      setBusy(false)
    }
  }

  const itemSelect = (filter?: (i: InventoryItem) => boolean) => (
    <div>
      <label className={labelClass}>Item</label>
      <select className={inputClass} value={itemId || inventory[0]?.id || ''} onChange={(e) => setItemId(e.target.value)}>
        {inventory.filter(filter ?? (() => true)).map((i) => <option key={i.id} value={i.id}>{i.name} — {fmtNum(i.quantity)} {i.unit}</option>)}
      </select>
    </div>
  )

  const unitLabel = tab === 'resupply' || tab === 'consumption' ? (resource === 'food' ? 'kg' : 'L') : item?.unit ?? ''

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto"><SegTabs value={tab} onChange={(v) => { setTab(v); setMsg(null) }} options={TAB_META} /></div>

      <p className="font-sans text-xs text-white/70 leading-relaxed">
        {tab === 'count' && 'Physical count of a stock line — replaces the recorded quantity.'}
        {tab === 'delivery' && 'Goods received: adds the amount to the recorded quantity.'}
        {tab === 'consumption' && 'What was used on a given day. Three or more fuel entries let the Energy forecast calibrate to your real burn.'}
        {tab === 'resupply' && 'A delivery you expect (ship, flight, convoy). It is not added to stock — it extends the projected run-out date.'}
        {tab === 'item' && 'Create a stock line that is not tracked yet.'}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(tab === 'count' || tab === 'delivery') && <div className="sm:col-span-2">{itemSelect()}</div>}
        {(tab === 'consumption' || tab === 'resupply') && (
          <div>
            <label className={labelClass}>Resource</label>
            <select className={inputClass} value={resource} onChange={(e) => setResource(e.target.value as LedgerResource)}>
              <option value="fuel">Fuel (L)</option>
              <option value="food">Food (kg)</option>
              {tab === 'consumption' && <option value="water">Water (L)</option>}
            </select>
          </div>
        )}
        {tab === 'resupply' && (
          <div>
            <label className={labelClass}>Label</label>
            <input className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
        )}
        {tab === 'item' && (
          <>
            <div className="sm:col-span-2"><label className={labelClass}>Name</label><input className={inputClass} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Hydraulic oil drums" /></div>
            <div>
              <label className={labelClass}>Category</label>
              <select className={inputClass} value={newCat} onChange={(e) => setNewCat(e.target.value)}>
                <option value="fuel">Fuel</option><option value="food">Food</option><option value="spare">Spare</option>
              </select>
            </div>
            <div><label className={labelClass}>Unit</label><input className={inputClass} value={newUnit} onChange={(e) => setNewUnit(e.target.value)} /></div>
            <div><label className={labelClass}>Reorder at (optional)</label><input type="number" min={0} className={inputClass} value={reorder} onChange={(e) => setReorder(e.target.value)} /></div>
          </>
        )}
        <div>
          <label className={labelClass}>{tab === 'count' ? 'Counted quantity' : tab === 'item' ? 'Opening quantity' : tab === 'delivery' ? 'Amount received' : 'Amount'} {unitLabel && `(${unitLabel})`}</label>
          <input type="number" min={0} className={inputClass} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
          {tab === 'count' && item && <p className="font-mono text-[11px] text-white/62 mt-1">Recorded: {fmtNum(item.quantity)} {item.unit}{qty !== '' ? ` → change ${n - item.quantity >= 0 ? '+' : ''}${fmtNum(n - item.quantity)}` : ''}</p>}
        </div>
        {tab !== 'item' && (
          <div><label className={labelClass}>{tab === 'resupply' ? 'Expected on' : 'Date'}</label><input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} /></div>
        )}
        <div><label className={labelClass}>Recorded by</label><input className={inputClass} value={by} onChange={(e) => setBy(e.target.value)} placeholder="Name / initials" /></div>
        <div><label className={labelClass}>Note</label><input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" /></div>
      </div>

      {tab === 'consumption' && (
        <label className="flex items-center gap-2 font-sans text-xs text-white/80 cursor-pointer">
          <input type="checkbox" className="accent-cyan" checked={deduct} onChange={(e) => setDeduct(e.target.checked)} />
          Also deduct from a stock line
          {deduct && (
            <select className={`${inputClass} !w-auto !py-1`} value={itemId} onChange={(e) => setItemId(e.target.value)}>
              <option value="">choose…</option>
              {inventory.filter((i) => i.category === resource).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          )}
        </label>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="primary" size="md" loading={busy} disabled={!valid} icon={<Send size={14} />} onClick={submit}>Save entry</Button>
        {msg && <span className={`font-sans text-xs ${msg.ok ? 'text-emerald' : 'text-crimson'}`}>{msg.text}</span>}
      </div>
    </div>
  )
}

// ─── Activity log ───────────────────────────────────────────────────────────

function ActivityLog({ station }: { station: string }) {
  const entries = useLedgerStore((s) => s.entries)
  const deliveries = useLedgerStore((s) => s.deliveries)
  const removeEntry = useLedgerStore((s) => s.removeEntry)
  const removeDelivery = useLedgerStore((s) => s.removeDelivery)
  const mine = entries.filter((e) => e.station === station)
  const upcoming = deliveries.filter((d) => d.station === station).sort((a, b) => a.date.localeCompare(b.date))

  const exportCsv = () => {
    const blob = new Blob([ledgerToCsv(mine)], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${station}-logistics-ledger-${isoDate(new Date())}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="space-y-4">
      {upcoming.length > 0 && (
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wider text-white/70 mb-1.5 flex items-center gap-1.5"><CalendarClock size={12} /> Expected resupply</p>
          <div className="space-y-1.5">
            {upcoming.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 rounded-md bg-emerald/10 border border-emerald/30 px-3 py-1.5">
                <span className="font-sans text-xs text-white">{d.label} · <span className="font-mono">{fmtNum(d.amount)} {d.resource === 'fuel' ? 'L' : 'kg'} {d.resource}</span> · {fmtDate(d.date)}</span>
                <button onClick={() => removeDelivery(d.id)} className="text-white/55 hover:text-crimson" aria-label="Remove"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-wider text-white/70 flex items-center gap-1.5"><History size={12} /> Recent entries ({mine.length})</p>
        <Button variant="secondary" size="sm" icon={<Download size={12} />} onClick={exportCsv} disabled={mine.length === 0}>CSV</Button>
      </div>
      {mine.length === 0 ? (
        <p className="font-sans text-xs text-white/62 py-4">Nothing recorded yet. Entries you save on the left appear here and are kept in this browser.</p>
      ) : (
        <div className="max-h-[300px] overflow-y-auto divide-y divide-brand-border border border-brand-border rounded-md">
          {mine.slice(0, 40).map((e) => (
            <div key={e.id} className="flex items-start justify-between gap-3 px-3 py-2 bg-brand-surface">
              <div className="min-w-0">
                <p className="font-sans text-xs text-white">
                  <span className="font-mono text-[10px] uppercase font-bold px-1.5 py-0.5 rounded mr-2" style={{ color: KIND_COLOR[e.kind], background: `${KIND_COLOR[e.kind]}1a` }}>{KIND_LABEL[e.kind]}</span>
                  {e.itemName ?? e.resource} · <span className="font-mono">{fmtNum(e.quantity)} {e.unit}</span>
                </p>
                <p className="font-mono text-[11px] text-white/62 mt-0.5">{e.date}{e.by ? ` · ${e.by}` : ''}{e.note ? ` · ${e.note}` : ''}</p>
              </div>
              <button onClick={() => removeEntry(e.id)} className="text-white/45 hover:text-crimson shrink-0 mt-0.5" aria-label="Delete entry"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function LogisticsPage() {
  const station = useStationStore((s) => s.station)
  const entries = useLedgerStore((s) => s.entries)
  const deliveries = useLedgerStore((s) => s.deliveries)
  const { model, error: modelError } = useForecastModel()
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [convoys, setConvoys] = useState<Convoy[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [convoyName, setConvoyName] = useState('')
  const [creatingConvoy, setCreatingConvoy] = useState(false)
  const [departError, setDepartError] = useState<Record<string, string>>({})
  const [resource, setResource] = useState<'food' | 'water'>('food')

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    setError(null)
    try {
      const [inv, veh, conv] = await Promise.allSettled([
        logisticsService.getInventory(station),
        logisticsService.getVehicles(station),
        logisticsService.getConvoys(station),
      ])
      setInventory(inv.status === 'fulfilled' ? [...inv.value] : [])
      setVehicles(veh.status === 'fulfilled' ? veh.value : [])
      setConvoys(conv.status === 'fulfilled' ? conv.value : [])
      if (inv.status === 'rejected' && veh.status === 'rejected' && conv.status === 'rejected') setError('Logistics backend unavailable')
    } finally {
      setLoading(false)
    }
  }, [station])

  useEffect(() => { load() }, [load])

  const fuelL = inventory.filter((i) => i.category === 'fuel').reduce((s, i) => s + i.quantity, 0)
  const foodKg = inventory.filter((i) => i.category === 'food').reduce((s, i) => s + i.quantity, 0)

  const outlook = useMemo(() => (model ? buildOutlook(model, station, { fuelL, foodKg }, { deliveries, entries }) : null), [model, station, fuelL, foodKg, deliveries, entries])

  const foodChart: BandPoint[] = useMemo(() => {
    if (!outlook) return []
    return outlook.food.trajectory.filter((_, i) => i % 5 === 0 && i <= 540).map((p) => ({ x: p.date, mid: p.mid, lo: p.lo, hi: p.hi }))
  }, [outlook])

  const useChart: BandPoint[] = useMemo(() => {
    if (!model || !outlook) return []
    const h = model.history[station]
    const key = resource === 'food' ? 'food_kg' : 'water_l'
    const last = h.dates[h.dates.length - 1]
    const past = h.dates.map((d, i) => ({ x: d, actual: h[key][i], fit: h[`${key}_pred` as 'food_kg_pred'][i] })).slice(-60)
    const future = projectConsumption(model, station, todayUtc(), 45).filter((f) => f.date > last).map((f) => ({ x: f.date, mid: f[key].mid, lo: f[key].lo, hi: f[key].hi }))
    return [...past, ...future]
  }, [model, outlook, station, resource])

  const lowStock = inventory.filter((i) => i.reorder_threshold !== null && i.quantity <= i.reorder_threshold).length
  const staleCounts = inventory.filter((i) => (ageDays(i.last_counted_at) ?? 999) > 14).length
  const readyVehicles = vehicles.filter((v) => v.status === 'operational' || v.status === 'ready' || v.status === 'ok').length
  const waterToday = outlook?.forecast[0].water_l.mid ?? 0
  const foodDays = outlook?.food.daysMid ?? null
  const crew = outlook?.forecast[0].headcount ?? 0

  const handleCreateConvoy = async () => {
    if (!convoyName.trim()) return
    setCreatingConvoy(true)
    try {
      await logisticsService.createConvoy({ station_id: station, name: convoyName.trim() })
      setConvoyName('')
      await load(true)
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
      await load(true)
    } catch (err) {
      setDepartError((prev) => ({ ...prev, [id]: err instanceof Error ? err.message : 'Failed to depart' }))
    }
  }

  return (
    <PageShell>
      <PageHeader
        icon={<Package size={20} />} eyebrow="Operations"
        title={`Logistics — ${STATION_LABELS[station]}`}
        subtitle="Supplies are counted and booked by people, so this page is built around entry: record counts, deliveries and daily use, tell the forecast what resupply to expect, and see how long food and water will last."
        actions={<><SyntheticChip /><Button variant="secondary" size="sm" icon={<RefreshCw size={13} />} onClick={() => load()}>Refresh</Button></>}
      />

      {loading && <div className="flex justify-center py-16"><InlineLoader text="Loading logistics data…" /></div>}
      {error && !loading && <ErrorState message={error} onRetry={() => load()} />}
      {modelError && <ErrorState message={modelError} />}

      {!loading && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <MetricTile label="Food endurance" value={outlook ? fmtDays(foodDays) : '…'} unit="days" color={endurance_color(foodDays)} icon={<Wheat size={15} />}
              hint={outlook ? `${fmtNum(foodKg)} kg · ${crew} crew` : undefined} />
            <MetricTile label="Fuel endurance" value={outlook ? fmtDays(outlook.fuel.daysMid) : '…'} unit="days" color={endurance_color(outlook?.fuel.daysMid ?? null)} icon={<Gauge size={15} />}
              hint="Detail on Energy page" />
            <MetricTile label="Water demand" value={fmtNum(waterToday)} unit="L/day" icon={<Droplets size={15} />} hint="Expected today" />
            <MetricTile label="Low stock lines" value={lowStock} color={lowStock ? '#B23A2E' : '#1F9E6D'} icon={<AlertTriangle size={15} />} hint={`${staleCounts} not counted in 14+ days`} />
            <MetricTile label="Vehicles ready" value={`${readyVehicles}/${vehicles.length}`} icon={<Truck size={15} />} />
            <MetricTile label="Convoys" value={convoys.length} icon={<Users size={15} />} hint={`${convoys.filter((c) => c.status === 'underway' || c.status === 'departed').length} underway`} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4">
            <Panel title="Manual entry desk" icon={<ClipboardList size={14} />} accent={CHART.blue}>
              <EntryDesk station={station} inventory={inventory} onChanged={() => load(true)} />
            </Panel>
            <Panel title="Activity log" icon={<History size={14} />}>
              <ActivityLog station={station} />
            </Panel>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Panel title="Food stock outlook" icon={<Wheat size={14} />}
              subtitle={outlook ? `At the forecast consumption the food lasts about ${fmtDays(foodDays)} days (${fmtDays(outlook.food.daysEarliest)}–${fmtDays(outlook.food.daysLatest)}).` : undefined}>
              <BandChart data={foodChart} unit="kg" height={250} color={CHART.green} midName="Projected stock" bandName="Heavy ↔ light use" yDomain={[0, 'auto']} yFormat={(v) => `${fmtNum(v / 1000)}k`} />
            </Panel>
            <Panel title="Daily consumption" icon={resource === 'food' ? <Wheat size={14} /> : <Droplets size={14} />}
              subtitle="Last 60 days (synthetic actual vs model fit) and the next 45 days."
              actions={<SegTabs size="sm" value={resource} onChange={setResource} options={[{ value: 'food', label: 'Food' }, { value: 'water', label: 'Water' }]} />}>
              <BandChart data={useChart} unit={resource === 'food' ? 'kg/day' : 'L/day'} height={250} color={resource === 'food' ? CHART.green : CHART.blue} yFormat={(v) => fmtNum(v)} />
            </Panel>
          </div>

          <Panel title="Inventory" icon={<Package size={14} />}>
            {inventory.length === 0 ? <EmptyState message="No inventory records" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="font-mono text-[11px] uppercase tracking-wider text-white/62 text-left">
                      <th className="py-1.5 pr-3 font-semibold">Item</th><th className="py-1.5 pr-3 font-semibold">Category</th>
                      <th className="py-1.5 pr-3 font-semibold text-right">Quantity</th><th className="py-1.5 pr-3 font-semibold w-40">Vs reorder level</th>
                      <th className="py-1.5 pr-3 font-semibold text-right">Reorder at</th><th className="py-1.5 font-semibold text-right">Last counted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventory.map((item) => {
                      const low = item.reorder_threshold !== null && item.quantity <= item.reorder_threshold
                      const age = ageDays(item.last_counted_at)
                      const ratio = item.reorder_threshold ? item.quantity / (item.reorder_threshold * 3) : null
                      return (
                        <tr key={item.id} className="border-t border-brand-border">
                          <td className="py-2 pr-3 font-sans text-white">{item.name}</td>
                          <td className="py-2 pr-3 font-mono uppercase text-white/70">{item.category}</td>
                          <td className={`py-2 pr-3 font-mono text-right ${low ? 'text-crimson font-bold' : 'text-white'}`}>{fmtNum(item.quantity)} {item.unit}</td>
                          <td className="py-2 pr-3">{ratio !== null ? <Bar value={ratio * 100} color={low ? CHART.red : CHART.green} /> : <span className="text-white/45">—</span>}</td>
                          <td className="py-2 pr-3 font-mono text-right text-white/70">{item.reorder_threshold?.toLocaleString() ?? '—'}</td>
                          <td className={`py-2 font-mono text-right ${age !== null && age > 14 ? 'text-amber font-bold' : 'text-white/70'}`}>{age === null ? 'never' : age === 0 ? 'today' : `${age} d ago`}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Panel title="Vehicle fleet" icon={<Truck size={14} />}>
              {vehicles.length === 0 ? <EmptyState message="No vehicles registered" /> : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {vehicles.map((v) => (
                    <div key={v.id} className="rounded-md border border-brand-border bg-brand-surface-2 p-3">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="text-sm font-sans font-medium text-white leading-snug">{v.name}</span>
                        <Badge variant={v.status === 'operational' || v.status === 'ready' || v.status === 'ok' ? 'healthy' : 'warning'} size="sm">{v.status}</Badge>
                      </div>
                      <p className="font-mono text-[11px] text-white/62 uppercase mb-2">{v.vehicle_type}{v.run_hours !== null ? ` · ${fmtNum(v.run_hours)} h` : ''}</p>
                      {v.fuel_level_percent !== null && (
                        <>
                          <div className="flex justify-between font-mono text-[11px] text-white/70 mb-1"><span className="flex items-center gap-1"><Flame size={11} /> Fuel</span><span>{v.fuel_level_percent}%</span></div>
                          <Bar value={v.fuel_level_percent} color={healthColor(v.fuel_level_percent)} />
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Convoy planner" icon={<Users size={14} />}>
              <div className="flex gap-2 mb-3">
                <input value={convoyName} onChange={(e) => setConvoyName(e.target.value)} placeholder="New convoy name…" className={inputClass} />
                <Button variant="primary" size="md" icon={<Plus size={14} />} loading={creatingConvoy} onClick={handleCreateConvoy}>Add</Button>
              </div>
              {convoys.length === 0 ? <EmptyState message="No convoys planned" /> : (
                <div className="space-y-3">
                  {convoys.map((c) => (
                    <div key={c.id} className="rounded-md border border-brand-border bg-brand-surface-2 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-sans font-medium text-white">{c.name}</span>
                        <Badge variant={c.status === 'departed' || c.status === 'underway' ? 'healthy' : 'neutral'} size="sm">{c.status}</Badge>
                      </div>
                      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px] font-mono text-white/70 mb-2">
                        <span>{c.vehicle_ids.length} vehicle(s)</span>
                        <span>{c.members.length} member(s)</span>
                        <span className={c.has_medical_officer ? 'text-emerald' : 'text-amber'}>{c.has_medical_officer ? 'Medical officer ✓' : 'No medical officer'}</span>
                        <span className={c.has_ambulance_escort ? 'text-emerald' : 'text-amber'}>{c.has_ambulance_escort ? 'Ambulance escort ✓' : 'No ambulance escort'}</span>
                      </div>
                      {c.status === 'planned' && (
                        <div className="flex items-center gap-2">
                          <Button variant="secondary" size="sm" icon={<Send size={12} />} onClick={() => handleDepart(c.id)}>Depart</Button>
                          {departError[c.id] && <span className="text-xs font-mono text-crimson">{departError[c.id]}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </>
      )}
    </PageShell>
  )
}
