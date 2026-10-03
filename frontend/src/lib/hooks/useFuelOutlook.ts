// src/lib/hooks/useFuelOutlook.ts
//
// Fuel endurance with a model fallback. Telemetry-derived burn (useFuel) is the
// preferred source, but when the tank history is too flat or stale to show a
// measurable drawdown the trained consumption model supplies the burn rate, so
// the endurance figure is still a number instead of a dash. `source` says which.
'use client'

import { useMemo } from 'react'
import { useFuelEndurance, type FuelState } from '@/lib/hooks/useFuel'
import { useForecastModel } from '@/lib/ml/useForecastModel'
import { buildOutlook } from '@/lib/ml/outlook'
import { useLedgerStore } from '@/store/useLedgerStore'
import type { StationKey } from '@/lib/ml/engine'

export interface FuelWithModel extends FuelState {
  /** burn actually used for `days` (L/h) */
  burnUsedLph: number
  /** days of endurance actually shown */
  daysUsed: number | null
  source: 'telemetry' | 'model' | 'none'
}

export function useFuelOutlook(station: StationKey, fallbackL = 0): FuelWithModel {
  const fuel = useFuelEndurance(station)
  const { model } = useForecastModel()
  const deliveries = useLedgerStore((s) => s.deliveries)
  const stock = fuel.totalL || fallbackL
  const modelOutlook = useMemo(
    () => (model && stock > 0 ? buildOutlook(model, station, { fuelL: stock, foodKg: 0 }, { deliveries }) : null),
    [model, station, stock, deliveries],
  )
  const telemetryOk = fuel.burnLph > 0.5 && fuel.days !== null
  if (telemetryOk) return { ...fuel, burnUsedLph: fuel.burnLph, daysUsed: fuel.days, source: 'telemetry' }
  if (modelOutlook) return { ...fuel, totalL: stock, burnUsedLph: modelOutlook.fuel.avgDailyBurn / 24, daysUsed: modelOutlook.fuel.daysMid, source: 'model' }
  return { ...fuel, burnUsedLph: 0, daysUsed: null, source: 'none' }
}
