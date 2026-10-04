// src/lib/syntheticData/stockData.ts
//
// Synthetic stock ledger used ONLY when the station database has no inventory
// lines for a resource (the deployed backend's /inventory is empty). Sized so the
// forecast model (~85 kg/day food at winter headcount) gives a believable
// endurance: roughly 9-11 months of food, with stock lines that read like a real
// station store-room. Anything the team counts or books overrides these figures.

export interface SyntheticStockLine {
  key: string
  kind: 'food' | 'spare' | 'medical' | 'water'
  name: string
  quantity: number
  unit: string
  reorder_threshold: number
  /** days ago the line was last physically checked (for the "last checked" column) */
  checkedDaysAgo: number
}

type Station = 'maitri' | 'bharati'

export const SYNTHETIC_STOCK: Record<Station, SyntheticStockLine[]> = {
  maitri: [
    { key: 'dry-rations', kind: 'food', name: 'Dry rations (rice, atta, pulses)', quantity: 9800, unit: 'kg', reorder_threshold: 3000, checkedDaysAgo: 4 },
    { key: 'frozen-protein', kind: 'food', name: 'Frozen meat, fish & eggs', quantity: 4900, unit: 'kg', reorder_threshold: 1500, checkedDaysAgo: 4 },
    { key: 'tinned-goods', kind: 'food', name: 'Tinned & ready-to-eat meals', quantity: 3600, unit: 'kg', reorder_threshold: 1200, checkedDaysAgo: 9 },
    { key: 'fresh-produce', kind: 'food', name: 'Hydroponic & fresh produce', quantity: 420, unit: 'kg', reorder_threshold: 150, checkedDaysAgo: 1 },
    { key: 'dairy-oil', kind: 'food', name: 'Dairy, oils & condiments', quantity: 2300, unit: 'kg', reorder_threshold: 700, checkedDaysAgo: 9 },
    { key: 'spare-filters', kind: 'spare', name: 'Fuel & air filter set', quantity: 38, unit: 'sets', reorder_threshold: 12, checkedDaysAgo: 14 },
    { key: 'spare-belts', kind: 'spare', name: 'Pump seals & drive belts', quantity: 26, unit: 'pcs', reorder_threshold: 10, checkedDaysAgo: 14 },
    { key: 'spare-heat-trace', kind: 'spare', name: 'Heat-trace cable (3 m kits)', quantity: 17, unit: 'kits', reorder_threshold: 6, checkedDaysAgo: 21 },
    { key: 'med-consumables', kind: 'medical', name: 'Surgical & wound-care consumables', quantity: 210, unit: 'packs', reorder_threshold: 60, checkedDaysAgo: 7 },
    { key: 'med-oxygen', kind: 'medical', name: 'Medical oxygen cylinders', quantity: 14, unit: 'cyl', reorder_threshold: 6, checkedDaysAgo: 3 },
  ],
  bharati: [
    { key: 'dry-rations', kind: 'food', name: 'Dry rations (rice, atta, pulses)', quantity: 11200, unit: 'kg', reorder_threshold: 3500, checkedDaysAgo: 3 },
    { key: 'frozen-protein', kind: 'food', name: 'Frozen meat, fish & eggs', quantity: 5600, unit: 'kg', reorder_threshold: 1800, checkedDaysAgo: 3 },
    { key: 'tinned-goods', kind: 'food', name: 'Tinned & ready-to-eat meals', quantity: 4100, unit: 'kg', reorder_threshold: 1400, checkedDaysAgo: 8 },
    { key: 'fresh-produce', kind: 'food', name: 'Hydroponic & fresh produce', quantity: 510, unit: 'kg', reorder_threshold: 180, checkedDaysAgo: 1 },
    { key: 'dairy-oil', kind: 'food', name: 'Dairy, oils & condiments', quantity: 2700, unit: 'kg', reorder_threshold: 800, checkedDaysAgo: 8 },
    { key: 'spare-filters', kind: 'spare', name: 'Fuel & air filter set', quantity: 44, unit: 'sets', reorder_threshold: 14, checkedDaysAgo: 12 },
    { key: 'spare-belts', kind: 'spare', name: 'Pump seals & drive belts', quantity: 31, unit: 'pcs', reorder_threshold: 10, checkedDaysAgo: 12 },
    { key: 'spare-heat-trace', kind: 'spare', name: 'Heat-trace cable (3 m kits)', quantity: 21, unit: 'kits', reorder_threshold: 6, checkedDaysAgo: 19 },
    { key: 'med-consumables', kind: 'medical', name: 'Surgical & wound-care consumables', quantity: 240, unit: 'packs', reorder_threshold: 70, checkedDaysAgo: 6 },
    { key: 'med-oxygen', kind: 'medical', name: 'Medical oxygen cylinders', quantity: 16, unit: 'cyl', reorder_threshold: 6, checkedDaysAgo: 2 },
  ],
}
