// Backend → normalised frontend telemetry. Two backend shapes exist:
//  • GET /api/telemetry/latest → DeviceState[]            (snapshot)
//  • WS /ws/digital-twin       → { type:'DEVICE_UPDATE' } (push)
import { ASSET_BY_ID } from './config'
import type { Health, Reading } from './types'

interface DeviceState {
  deviceId: string
  deviceType?: string
  value: number
  displayValue?: string
  unit?: string
  status: string
  timestamp: number
}

const HEALTH: Record<string, Health> = { NORMAL: 'normal', WARNING: 'warning', CRITICAL: 'critical', OFFLINE: 'offline' }

function build(d: DeviceState, receivedAt: number): Reading | null {
  if (!d || typeof d.deviceId !== 'string' || !(d.deviceId in ASSET_BY_ID)) return null
  const value = Number(d.value)
  if (!Number.isFinite(value)) return null
  const status = HEALTH[String(d.status).toUpperCase()] ?? 'offline'
  return {
    assetId: d.deviceId,
    key: d.deviceType ?? ASSET_BY_ID[d.deviceId].type,
    value,
    display: d.displayValue ?? '',
    unit: d.unit ?? ASSET_BY_ID[d.deviceId].unit,
    timestamp: Number(d.timestamp) || receivedAt,
    receivedAt,
    quality: status === 'offline' ? 'bad' : 'good',
    status,
  }
}

export function adaptSnapshot(payload: unknown, receivedAt = Date.now()): Reading[] {
  if (!Array.isArray(payload)) return []
  return payload.map((d) => build(d as DeviceState, receivedAt)).filter((r): r is Reading => r !== null)
}

export function adaptFrame(raw: unknown, receivedAt = Date.now()): Reading[] {
  const m = raw as { type?: string; deviceId?: string; data?: Partial<DeviceState>; timestamp?: number; devices?: unknown }
  if (m?.type === 'CONNECTED' && Array.isArray(m.devices)) return adaptSnapshot(m.devices, receivedAt)
  if (m?.type !== 'DEVICE_UPDATE' || !m.deviceId || !m.data) return []
  const r = build({ deviceId: m.deviceId, timestamp: m.timestamp ?? receivedAt, ...m.data } as DeviceState, receivedAt)
  return r ? [r] : []
}

/** Human value, honouring boolean state labels. */
export function formatValue(r: Reading | null | undefined, assetId: string): string {
  if (!r) return '—'
  const a = ASSET_BY_ID[assetId]
  if (a?.boolean && a.stateLabels) return a.stateLabels[r.value ? 1 : 0]
  if (r.display) return r.display
  return Number.isInteger(r.value) ? String(r.value) : r.value.toFixed(1)
}
