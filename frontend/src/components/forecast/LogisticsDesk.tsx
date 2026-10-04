// src/components/forecast/LogisticsDesk.tsx
//
// Logistics stock is counted by people, so this is the "entry desk": record a
// stock count, a delivery received, a day's consumption, a delivery you expect,
// or a brand-new stock line — then see how long food and water will last.
// Counts and new lines go to the real /inventory API; consumption entries and
// expected resupplies live in the browser ledger (useLedgerStore) and feed the
// forecast. Everything modelled here is flagged as synthetic-data forecasting.
'use client'

import { useMemo, useState } from 'react'
import { ClipboardList, Download, History, Send, Trash2, Wheat, Droplets, CalendarClock } from 'lucide-react'
import { Kpi, Panel, Pill, Meter, Skeleton, type Tone } from '@/components/ui/kit'
import { BandChart, type BandPoint } from '@/components/forecast/ForecastCharts'
import { SegTabs, inputClass, labelClass } from '@/components/ui/Panel'
import { useForecastModel } from '@/lib/ml/useForecastModel'
import { buildOutlook, fmtDate, fmtDays, todayUtc } from '@/lib/ml/outlook'
import { projectConsumption, isoDate, type StationKey } from '@/lib/ml/engine'
import { useLedgerStore, useStockItems, ledgerToCsv, type LedgerResource } from '@/store/useLedgerStore'
import { CHART, fmtNum } from '@/lib/chartTheme'

export interface StockItem {
  id: string
  name: string
  kind: string
  quantity: number
  unit: string
  reorder_threshold?: number | null
  last_checked?: string | null
  local?: boolean
}

type Tab = 'count' | 'delivery' | 'consumption' | 'resupply' | 'item'
const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'count', label: 'Stock count' },
  { value: 'delivery', label: 'Receive delivery' },
  { value: 'consumption', label: 'Daily use' },
  { value: 'resupply', label: 'Expected resupply' },
  { value: 'item', label: 'New item' },
]
const KIND_COLOR: Record<string, string> = { count: CHART.blue, delivery: CHART.green, consumption: CHART.amber, adjustment: CHART.violet }

class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function post(url: string, body: unknown) {
  let r: Response
  try {
    r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    throw new ApiError('Network error', 0)
  }
  if (!r.ok) {
    const j = await r.json().catch(() => ({}))
    const e = (j as { error?: unknown; detail?: unknown }).error ?? (j as { detail?: unknown }).detail
    throw new ApiError(typeof e === 'string' ? e.slice(0, 200) : `Request failed (${r.status})`, r.status)
  }
  return r.json()
}

const DEVICE_NOTE = ' Saved on this device — the station database is not accepting this write right now.'

/** The database being unable to take a write (older backend, offline, outage) — as opposed to rejecting the input. */
const isUnavailable = (e: unknown) => e instanceof ApiError && (e.status === 0 || e.status === 404 || e.status === 405 || e.status >= 500)

/** Try the station database; if it cannot take the write, run the on-device fallback instead. */
async function saveOrLocal<T>(remote: () => Promise<T>, local: () => void): Promise<{ saved: 'server' | 'device'; result: T | null }> {
  try {
    return { saved: 'server', result: await remote() }
  } catch (e) {
    if (!isUnavailable(e)) throw e
    local()
    return { saved: 'device', result: null }
  }
}

function EntryDesk({ station, items, onChanged }: { station: StationKey; items: StockItem[]; onChanged: () => void }) {
  const addEntry = useLedgerStore((s) => s.addEntry)
  const addDelivery = useLedgerStore((s) => s.addDelivery)
  const addLocalItem = useLedgerStore((s) => s.addLocalItem)
  const setQuantity = useLedgerStore((s) => s.setQuantity)
  const [tab, setTab] = useState<Tab>('count')
  const [itemId, setItemId] = useState('')
  const [qty, setQty] = useState('')
  const [date, setDate] = useState(isoDate(new Date()))
  const [by, setBy] = useState('')
  const [note, setNote] = useState('')
  const [resource, setResource] = useState<LedgerResource>('fuel')
  const [label, setLabel] = useState('Ship resupply')
  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState('food')
  const [newUnit, setNewUnit] = useState('kg')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const item = items.find((i) => i.id === (itemId || items[0]?.id))
  const n = Number(qty)
  const needsItem = tab === 'count' || tab === 'delivery'
  const valid = qty !== '' && n >= 0 && (tab === 'item' ? newName.trim().length > 1 : needsItem ? !!item && by.trim().length > 1 : true)

  const submit = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const base = { station, date, by: by.trim() || undefined, note: note.trim() || undefined }
      const checked_by = by.trim() || 'station-desk'
      if ((tab === 'count' || tab === 'delivery') && item) {
        const next = tab === 'count' ? n : item.quantity + n
        // device-only lines have no server record to write to
        const { saved } = item.id.startsWith('local-') || item.id.startsWith('synthetic-')
          ? { saved: 'device' as const }
          : await saveOrLocal(() => post(`/api/inventory/${encodeURIComponent(item.id)}/count`, { quantity: next, checked_by }), () => undefined)
        if (saved === 'device' || item.local) setQuantity(item.id, next, checked_by)
        addEntry({ ...base, kind: tab, resource: item.kind as LedgerResource, itemId: item.id, itemName: item.name, quantity: n, unit: item.unit })
        const note = saved === 'device' && !item.id.startsWith('local-') && !item.id.startsWith('synthetic-') ? DEVICE_NOTE : ''
        setMsg({ ok: true, text: tab === 'count' ? `${item.name} counted at ${fmtNum(n)} ${item.unit}.${note}` : `Received ${fmtNum(n)} ${item.unit}; ${item.name} is now ${fmtNum(next)} ${item.unit}.${note}` })
      } else if (tab === 'consumption') {
        addEntry({ ...base, kind: 'consumption', resource, quantity: n, unit: resource === 'food' ? 'kg' : 'L' })
        setMsg({ ok: true, text: `Logged ${fmtNum(n)} ${resource === 'food' ? 'kg' : 'L'} of ${resource} used on ${date}.` })
      } else if (tab === 'resupply') {
        addDelivery({ station, date, resource: resource === 'food' ? 'food' : 'fuel', amount: n, label: label.trim() || 'Resupply' })
        setMsg({ ok: true, text: `Expecting ${fmtNum(n)} ${resource === 'food' ? 'kg' : 'L'} on ${date} — the run-out forecast now includes it.` })
      } else if (tab === 'item') {
        const name = newName.trim()
        let localId = ''
        const { saved, result } = await saveOrLocal(
          () => post('/api/inventory', { station_id: station, kind: newKind, name, quantity: n, unit: newUnit, checked_by }) as Promise<StockItem>,
          () => { localId = addLocalItem({ station, kind: newKind, name, quantity: n, unit: newUnit, checked_by }).id },
        )
        addEntry({ ...base, kind: 'adjustment', resource: newKind as LedgerResource, itemId: result?.id ?? localId, itemName: name, quantity: n, unit: newUnit, note: 'New stock line created' })
        setNewName('')
        setMsg({ ok: true, text: `Added “${name}” — ${fmtNum(n)} ${newUnit}.${saved === 'device' ? DEVICE_NOTE : ''}` })
      }
      setQty('')
      setNote('')
      onChanged()
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not save entry' })
    } finally {
      setBusy(false)
    }
  }

  const unit = tab === 'consumption' || tab === 'resupply' ? (resource === 'food' ? 'kg' : 'L') : tab === 'item' ? newUnit : item?.unit ?? ''

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto"><SegTabs value={tab} onChange={(v) => { setTab(v); setMsg(null) }} options={TABS} /></div>
      <p className="text-[12.5px] text-white/70 leading-relaxed">
        {tab === 'count' && 'Physical count of a stock line — replaces the recorded quantity (needs your name for the audit trail).'}
        {tab === 'delivery' && 'Goods received: adds the amount to the recorded quantity.'}
        {tab === 'consumption' && 'What was used on a given day. Three or more fuel entries let the Energy forecast calibrate to your real burn.'}
        {tab === 'resupply' && 'A delivery you expect. It is not added to stock — it extends the projected run-out date.'}
        {tab === 'item' && 'Create a stock line that is not tracked yet.'}
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        {needsItem && (
          <div className="sm:col-span-2">
            <label className={labelClass}>Item</label>
            <select className={inputClass} value={itemId || items[0]?.id || ''} onChange={(e) => setItemId(e.target.value)} disabled={!items.length}>
              {items.length === 0 && <option>No stock lines yet — add one under “New item”</option>}
              {items.map((i) => <option key={i.id} value={i.id}>{i.name} — {fmtNum(i.quantity)} {i.unit}</option>)}
            </select>
          </div>
        )}
        {(tab === 'consumption' || tab === 'resupply') && (
          <div>
            <label className={labelClass}>Resource</label>
            <select className={inputClass} value={resource} onChange={(e) => setResource(e.target.value as LedgerResource)}>
              <option value="fuel">Fuel (L)</option><option value="food">Food (kg)</option>{tab === 'consumption' && <option value="water">Water (L)</option>}
            </select>
          </div>
        )}
        {tab === 'resupply' && <div><label className={labelClass}>Label</label><input className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} /></div>}
        {tab === 'item' && (
          <>
            <div className="sm:col-span-2"><label className={labelClass}>Name</label><input className={inputClass} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Dry rations" /></div>
            <div><label className={labelClass}>Kind</label>
              <select className={inputClass} value={newKind} onChange={(e) => { setNewKind(e.target.value); setNewUnit(e.target.value === 'fuel' ? 'L' : e.target.value === 'food' ? 'kg' : 'pcs') }}>
                <option value="fuel">Fuel</option><option value="food">Food</option><option value="spare">Spare</option><option value="waste">Waste</option>
              </select></div>
            <div><label className={labelClass}>Unit</label><input className={inputClass} value={newUnit} onChange={(e) => setNewUnit(e.target.value)} /></div>
          </>
        )}
        <div>
          <label className={labelClass}>{tab === 'count' ? 'Counted quantity' : tab === 'item' ? 'Opening quantity' : tab === 'delivery' ? 'Amount received' : 'Amount'} {unit && `(${unit})`}</label>
          <input type="number" min={0} className={inputClass} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
          {tab === 'count' && item && qty !== '' && <p className="font-mono text-[10.5px] text-white/75 mt-1">Recorded {fmtNum(item.quantity)} → change {n - item.quantity >= 0 ? '+' : ''}{fmtNum(n - item.quantity)}</p>}
        </div>
        {tab !== 'item' && <div><label className={labelClass}>{tab === 'resupply' ? 'Expected on' : 'Date'}</label><input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} /></div>}
        <div><label className={labelClass}>Recorded by{needsItem && ' *'}</label><input className={inputClass} value={by} onChange={(e) => setBy(e.target.value)} placeholder="Name / initials" /></div>
        <div><label className={labelClass}>Note</label><input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" /></div>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <button disabled={!valid || busy} onClick={submit}
          className="inline-flex items-center gap-2 rounded-lg bg-white text-brand-surface px-5 py-2.5 font-mono text-[11px] uppercase tracking-wider disabled:opacity-35 hover:opacity-90">
          <Send size={13} /> {busy ? 'Saving…' : 'Save entry'}
        </button>
        {msg && <span className={`text-[12.5px] ${msg.ok ? 'text-emerald' : 'text-crimson'}`}>{msg.text}</span>}
      </div>
    </div>
  )
}

function ActivityLog({ station }: { station: StationKey }) {
  const entries = useLedgerStore((s) => s.entries)
  const deliveries = useLedgerStore((s) => s.deliveries)
  const removeEntry = useLedgerStore((s) => s.removeEntry)
  const removeDelivery = useLedgerStore((s) => s.removeDelivery)
  const mine = entries.filter((e) => e.station === station)
  const upcoming = deliveries.filter((d) => d.station === station).sort((a, b) => a.date.localeCompare(b.date))
  const exportCsv = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([ledgerToCsv(mine)], { type: 'text/csv' }))
    a.download = `${station}-logistics-ledger-${isoDate(new Date())}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  return (
    <div className="space-y-4">
      {upcoming.length > 0 && (
        <div className="space-y-1.5">
          <p className="eyebrow flex items-center gap-1.5"><CalendarClock size={12} /> Expected resupply</p>
          {upcoming.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg bg-emerald/10 border border-emerald/30 px-3 py-1.5">
              <span className="text-[12.5px] text-white">{d.label} · <span className="font-mono">{fmtNum(d.amount)} {d.resource === 'fuel' ? 'L' : 'kg'}</span> · {fmtDate(d.date)}</span>
              <button onClick={() => removeDelivery(d.id)} className="text-white/55 hover:text-crimson" aria-label="Remove"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        <p className="eyebrow flex items-center gap-1.5"><History size={12} /> Recent entries ({mine.length})</p>
        <button onClick={exportCsv} disabled={!mine.length} className="inline-flex items-center gap-1.5 rounded-lg border border-brand-border bg-brand-surface px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-wider text-white/75 disabled:opacity-40 hover:text-white"><Download size={12} /> CSV</button>
      </div>
      {mine.length === 0 ? (
        <p className="text-[12.5px] text-white/75 py-3">Nothing recorded yet. Entries are kept in this browser; counts and new items are also written to the station database.</p>
      ) : (
        <div className="max-h-[300px] overflow-y-auto divide-y divide-brand-border/70 border border-brand-border rounded-xl">
          {mine.slice(0, 40).map((e) => (
            <div key={e.id} className="flex items-start justify-between gap-3 px-3 py-2 bg-brand-surface">
              <div className="min-w-0">
                <p className="text-[12.5px] text-white">
                  <span className="font-mono text-[10px] uppercase font-bold px-1.5 py-0.5 rounded mr-2" style={{ color: KIND_COLOR[e.kind], background: `${KIND_COLOR[e.kind]}1a` }}>{e.kind === 'consumption' ? 'use' : e.kind}</span>
                  {e.itemName ?? e.resource} · <span className="font-mono">{fmtNum(e.quantity)} {e.unit}</span>
                </p>
                <p className="font-mono text-[10.5px] text-white/55 mt-0.5">{e.date}{e.by ? ` · ${e.by}` : ''}{e.note ? ` · ${e.note}` : ''}</p>
              </div>
              <button onClick={() => removeEntry(e.id)} className="text-white/65 hover:text-crimson shrink-0" aria-label="Delete entry"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function LogisticsDesk({ station, items: serverItems, fuelL, onChanged }: { station: StationKey; items: StockItem[]; fuelL: number; onChanged: () => void }) {
  const items = useStockItems(station, serverItems)
  const { model, error } = useForecastModel()
  const deliveries = useLedgerStore((s) => s.deliveries)
  const entries = useLedgerStore((s) => s.entries)
  const [res, setRes] = useState<'food' | 'water'>('food')
  const foodKg = items.filter((i) => i.kind === 'food').reduce((a, i) => a + i.quantity, 0)

  const outlook = useMemo(() => (model ? buildOutlook(model, station, { fuelL, foodKg }, { deliveries, entries }) : null), [model, station, fuelL, foodKg, deliveries, entries])
  const foodDays = outlook?.food.daysMid ?? null
  const tone: Tone = foodKg === 0 ? 'mute' : foodDays !== null && foodDays < 90 ? 'warn' : 'ok'

  const foodChart: BandPoint[] = useMemo(
    () => (outlook ? outlook.food.trajectory.filter((_, i) => i % 5 === 0 && i <= 540).map((p) => ({ x: p.date, mid: p.mid, lo: p.lo, hi: p.hi })) : []),
    [outlook],
  )
  const useChart: BandPoint[] = useMemo(() => {
    if (!model) return []
    const h = model.history[station]
    const key = res === 'food' ? 'food_kg' : 'water_l'
    const last = h.dates[h.dates.length - 1]
    const past = h.dates.map((d, i) => ({ x: d, actual: h[key][i], fit: h[`${key}_pred` as 'food_kg_pred'][i] })).slice(-60)
    const future = projectConsumption(model, station, todayUtc(), 45).filter((f) => f.date > last).map((f) => ({ x: f.date, mid: f[key].mid, lo: f[key].lo, hi: f[key].hi }))
    return [...past, ...future]
  }, [model, station, res])

  const stale = items.filter((i) => i.last_checked && Date.now() - new Date(i.last_checked.endsWith('Z') ? i.last_checked : i.last_checked + 'Z').getTime() > 14 * 86400000).length

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Manual entry · prediction layer</p>
          <h2 className="font-display text-[26px] leading-tight text-white mt-1">Count it, log it, see how long it lasts.</h2>
        </div>
        <Pill tone="warn">forecast trained on synthetic data</Pill>
      </div>
      {error && <p className="font-mono text-[12px] text-crimson">{error}</p>}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 stagger">
        <Kpi label="Food endurance" value={foodKg ? foodDays : null} unit="days" tone={tone} icon={<Wheat size={15} />} hint={foodKg ? `${fmtNum(foodKg)} kg counted · range ${fmtDays(outlook?.food.daysEarliest ?? null)}–${fmtDays(outlook?.food.daysLatest ?? null)} d` : 'add a food stock line to forecast'} />
        <Kpi label="Fuel endurance" value={fuelL ? outlook?.fuel.daysMid ?? null : null} unit="days" tone={outlook?.fuel.daysMid != null && outlook.fuel.daysMid < 60 ? 'warn' : 'ok'} hint="from live tank sensors · see Energy" />
        <Kpi label="Water demand" value={outlook ? outlook.forecast[0].water_l.mid : null} unit="L/day" tone="primary" icon={<Droplets size={15} />} hint="expected today, from crew & weather" />
        <Kpi label="Stale counts" value={stale} tone={stale ? 'warn' : 'ok'} hint="stock lines not counted for 14+ days" />
      </div>

      <div className="grid xl:grid-cols-[1.5fr_1fr] gap-5">
        <Panel eyebrow="Stock room" title="Manual entry desk" right={<ClipboardList size={16} className="text-white/62" />}>
          <EntryDesk station={station} items={items} onChanged={onChanged} />
        </Panel>
        <Panel eyebrow="Ledger" title="Activity log"><ActivityLog station={station} /></Panel>
      </div>

      <div className="grid xl:grid-cols-2 gap-5">
        <Panel eyebrow="Projection" title="Food stock until run-out">
          {outlook && foodKg ? <BandChart data={foodChart} unit="kg" height={240} color={CHART.green} midName="Projected stock" bandName="Heavy ↔ light use" yDomain={[0, 'auto']} yFormat={(v) => `${fmtNum(v / 1000)}k`} />
            : <div className="text-[13px] text-white/75 py-10 text-center">{foodKg ? <Skeleton className="h-56" /> : 'Add a food stock line in the entry desk to see a projection.'}</div>}
        </Panel>
        <Panel eyebrow="Consumption" title="Daily use · actual vs model, then forecast"
          right={<SegTabs size="sm" value={res} onChange={setRes} options={[{ value: 'food', label: 'Food' }, { value: 'water', label: 'Water' }]} />}>
          <BandChart data={useChart} unit={res === 'food' ? 'kg/day' : 'L/day'} height={240} color={res === 'food' ? CHART.green : CHART.blue} yFormat={(v) => fmtNum(v)} />
        </Panel>
      </div>

      {items.length > 0 && (
        <Panel eyebrow="Stock" title="Counted inventory" pad={false}>
          <ul className="divide-y divide-brand-border/70">
            {items.map((i) => {
              const low = i.reorder_threshold != null && i.quantity <= i.reorder_threshold
              return (
                <li key={i.id} className="px-5 py-3 grid grid-cols-[1.5fr_1fr_1fr] gap-4 items-center">
                  <div><p className="text-[13px] text-white">{i.name}</p><p className="font-mono text-[10.5px] text-white/55 uppercase">{i.kind}{i.local ? ' · on this device' : ''}</p></div>
                  <p className={`font-mono text-[13px] num ${low ? 'text-crimson font-bold' : 'text-white'}`}>{fmtNum(i.quantity)} {i.unit}</p>
                  {i.reorder_threshold ? <Meter value={i.quantity} max={i.reorder_threshold * 3} tone={low ? 'crit' : 'ok'} height={6} /> : <span className="font-mono text-[10.5px] text-white/65">no reorder level</span>}
                </li>
              )
            })}
          </ul>
        </Panel>
      )}
    </div>
  )
}
