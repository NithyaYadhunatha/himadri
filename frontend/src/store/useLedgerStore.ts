// src/store/useLedgerStore.ts
//
// Logistics is manual entry: someone physically counts the fuel farm, books a
// delivery in, or writes down what was burned today. This store is the
// station's own entry ledger — an append-only list of those entries plus the
// resupply deliveries the team expects — kept in this browser (localStorage).
//
// It feeds two things:
//   * the Logistics page's activity log / CSV export, and
//   * the forecast: "expected deliveries" shift the run-out date, and the
//     observed burn from daily consumption entries can calibrate the model.
//
// Stock COUNTS are not stored here as the source of truth — they go through
// logisticsService.logCount (the real /inventory/{id}/count endpoint, or the
// mock array in USE_MOCK mode); this ledger only records that it happened.
import { useMemo } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type LedgerKind = 'count' | 'delivery' | 'consumption' | 'adjustment'
export type LedgerResource = 'fuel' | 'food' | 'water' | 'spare' | 'other'

export interface LedgerEntry {
  id: string
  station: string
  /** When the entry was recorded. */
  createdAt: string
  /** The date the quantity applies to (YYYY-MM-DD). */
  date: string
  kind: LedgerKind
  resource: LedgerResource
  itemId?: string
  itemName?: string
  /** count → the counted level; delivery → amount received; consumption → amount used that day. */
  quantity: number
  unit: string
  by?: string
  note?: string
}

export interface ExpectedDelivery {
  id: string
  station: string
  date: string // YYYY-MM-DD
  resource: 'fuel' | 'food'
  amount: number
  label: string
}

/** A stock line created on this device because the station database could not take it. */
export interface LocalItem {
  id: string // always prefixed "local-"
  station: string
  kind: string
  name: string
  quantity: number
  unit: string
  last_checked: string
  checked_by?: string
}

/** A count/receipt that could not be written to the database, applied on top of the server quantity. */
export interface QuantityOverride { quantity: number; at: string; by?: string }

interface LedgerState {
  entries: LedgerEntry[]
  deliveries: ExpectedDelivery[]
  localItems: LocalItem[]
  overrides: Record<string, QuantityOverride>
  addLocalItem: (i: Omit<LocalItem, 'id' | 'last_checked'>) => LocalItem
  setQuantity: (itemId: string, quantity: number, by?: string) => void
  addEntry: (e: Omit<LedgerEntry, 'id' | 'createdAt'>) => LedgerEntry
  removeEntry: (id: string) => void
  addDelivery: (d: Omit<ExpectedDelivery, 'id'>) => void
  removeDelivery: (id: string) => void
  clearStation: (station: string) => void
}

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

export const useLedgerStore = create<LedgerState>()(
  persist(
    (set) => ({
      entries: [],
      deliveries: [],
      localItems: [],
      overrides: {},
      addLocalItem: (i) => {
        const item: LocalItem = { ...i, id: `local-${uid()}`, last_checked: new Date().toISOString() }
        set((s) => ({ localItems: [...s.localItems, item] }))
        return item
      },
      setQuantity: (itemId, quantity, by) =>
        set((s) => {
          const at = new Date().toISOString()
          if (itemId.startsWith('local-')) {
            return { localItems: s.localItems.map((i) => (i.id === itemId ? { ...i, quantity, last_checked: at, checked_by: by } : i)) }
          }
          return { overrides: { ...s.overrides, [itemId]: { quantity, at, by } } }
        }),
      addEntry: (e) => {
        const entry: LedgerEntry = { ...e, id: uid(), createdAt: new Date().toISOString() }
        set((s) => ({ entries: [entry, ...s.entries].slice(0, 500) }))
        return entry
      },
      removeEntry: (id) => set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),
      addDelivery: (d) => set((s) => ({ deliveries: [...s.deliveries, { ...d, id: uid() }] })),
      removeDelivery: (id) => set((s) => ({ deliveries: s.deliveries.filter((d) => d.id !== id) })),
      clearStation: (station) =>
        set((s) => ({
          entries: s.entries.filter((e) => e.station !== station),
          deliveries: s.deliveries.filter((d) => d.station !== station),
          localItems: s.localItems.filter((i) => i.station !== station),
        })),
    }),
    { name: 'himadri-ledger' },
  ),
)

export function ledgerToCsv(entries: LedgerEntry[]): string {
  const head = ['date', 'recorded_at', 'station', 'kind', 'resource', 'item', 'quantity', 'unit', 'by', 'note']
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const rows = entries.map((e) => [e.date, e.createdAt, e.station, e.kind, e.resource, e.itemName ?? '', e.quantity, e.unit, e.by ?? '', e.note ?? ''].map(esc).join(','))
  return [head.join(','), ...rows].join('\n')
}

export interface MergedStockItem {
  id: string
  name: string
  kind: string
  quantity: number
  unit: string
  reorder_threshold?: number | null
  last_checked?: string | null
  /** true when this line (or its latest quantity) lives only on this device */
  local?: boolean
}

/** Server inventory + lines created on this device + counts that could not be saved server-side. */
export function useStockItems(station: string, server: MergedStockItem[]): MergedStockItem[] {
  const localItems = useLedgerStore((s) => s.localItems)
  const overrides = useLedgerStore((s) => s.overrides)
  return useMemo(() => {
    const fromServer = server.map((i) => {
      const o = overrides[i.id]
      return o ? { ...i, quantity: o.quantity, last_checked: o.at, local: true } : i
    })
    const mine = localItems.filter((i) => i.station === station).map((i) => ({ ...i, local: true }))
    return [...fromServer, ...mine]
  }, [server, localItems, overrides, station])
}
