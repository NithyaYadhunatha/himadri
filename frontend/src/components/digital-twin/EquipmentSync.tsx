'use client'

import { useEffect } from 'react'
import { usePoll } from '@/lib/hooks/usePoll'
import { digitalTwinBridge, type BridgeEvent } from '@/lib/twin/bridge'
import { EQUIPMENT } from '@/lib/twin/equipment/catalog'
import { useEquipment } from '@/lib/twin/equipment/store'
import { getEquipmentTelemetry, simulationEnabled } from '@/lib/twin/equipment/telemetry'
import { useTwin } from '@/lib/twin/store'
import type { StationWeather } from '@/services/environment.service'
import { useNow } from './now'

const WEATHER_URL = '/api/environment/weather?station=bharati'
// The route caches upstream for 5 min; polling faster would only re-read the cache.
const WEATHER_POLL_MS = 300_000

/**
 * Bharati only. Glue between the scene and the equipment UI, renders nothing:
 *  • 3D → web: equipmentSelected / equipmentCleared drive the details panel;
 *  • web → 3D: hostReady (Unity then frees the cursor on inspect), per-equipment state for the
 *    status LEDs/glow, and wind for the anemometer/turbine — all de-duplicated in the bridge;
 *  • the one weather poll that feeds getEquipmentTelemetry.
 */
export function EquipmentSync() {
  const wx = usePoll<StationWeather>(WEATHER_URL, WEATHER_POLL_MS)
  const mode = useTwin((s) => s.mode)
  const now = useNow()

  useEffect(() => {
    useEquipment.getState().setWeather(wx.data, wx.data ? wx.updatedAt : null)
  }, [wx.data, wx.updatedAt])

  useEffect(() => {
    const off = digitalTwinBridge.on((e: BridgeEvent) => {
      if (e.type === 'sceneLoaded' || e.type === 'capabilities') digitalTwinBridge.send({ type: 'hostReady' })
      else if (e.type === 'equipmentSelected') useEquipment.getState().select(e.equipmentId)
      else if (e.type === 'equipmentCleared') useEquipment.getState().select(null)
    })
    return () => { off(); useEquipment.getState().select(null) }
  }, [])

  // Push status + wind into the scene. Rounded so the bridge only sends real changes.
  useEffect(() => {
    const ctx = { weather: wx.data, weatherAt: wx.updatedAt, simulation: simulationEnabled(mode), now }
    for (const def of EQUIPMENT) {
      const t = getEquipmentTelemetry(def.id, ctx)
      digitalTwinBridge.setEquipmentState(def.id, t.health)
      for (const r of t.rows) {
        if (r.raw === undefined || r.source === 'unavailable') continue
        if (r.key === 'windSpeedKmh') digitalTwinBridge.setEquipmentTelemetry(def.id, r.key, Math.round(r.raw))
        else if (r.key === 'windDirectionDeg') digitalTwinBridge.setEquipmentTelemetry(def.id, r.key, Math.round(r.raw / 5) * 5)
      }
    }
  }, [wx.data, wx.updatedAt, mode, now])

  return null
}
