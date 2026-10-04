// Scientific-equipment UI state for the 3D console (zustand, like lib/twin/store.ts).
// Selection mirrors the Unity scene: Unity emits equipmentSelected / equipmentCleared and the
// dashboard's Close button sends clearEquipmentSelection back.
import { useMemo } from 'react'
import { create } from 'zustand'
import type { StationWeather } from '@/services/environment.service'
import { useTwin } from '../store'
import { getEquipmentTelemetry, simulationEnabled, type EquipmentTelemetry } from './telemetry'

interface EquipmentState {
  selectedId: string | null
  weather: StationWeather | null
  weatherAt: number | null
  select: (id: string | null) => void
  setWeather: (w: StationWeather | null, at: number | null) => void
}

export const useEquipment = create<EquipmentState>((set) => ({
  selectedId: null,
  weather: null,
  weatherAt: null,
  select: (selectedId) => set({ selectedId }),
  setWeather: (weather, weatherAt) => set({ weather, weatherAt }),
}))

/** Telemetry for one equipment, recomputed on the shared 1 s clock (pass useNow()). */
export function useEquipmentTelemetry(equipmentId: string | null, now: number): EquipmentTelemetry | null {
  const weather = useEquipment((s) => s.weather)
  const weatherAt = useEquipment((s) => s.weatherAt)
  const mode = useTwin((s) => s.mode)
  return useMemo(
    () => (equipmentId ? getEquipmentTelemetry(equipmentId, { weather, weatherAt, simulation: simulationEnabled(mode), now }) : null),
    [equipmentId, weather, weatherAt, mode, now],
  )
}
