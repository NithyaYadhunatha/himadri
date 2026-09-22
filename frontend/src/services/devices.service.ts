// src/services/devices.service.ts
//
// Device Scalability admin page — pending-approval queue + manifest
// registration, matching the backend's DeviceManifest shape. Falls back to
// lib/mockData/mockDevices.ts when NEXT_PUBLIC_USE_MOCK is set.

import { USE_MOCK } from '@/lib/constants'
import { mockDevices } from '@/lib/mockData/mockDevices'

export interface DeviceRule {
  type: string
  params: Record<string, unknown>
  severity: string
  category: string
}

export interface DeviceSeries {
  name: string
  unit: string
  kind: string
  critical: boolean
  stale_after_seconds: number
  default_rules: DeviceRule[]
}

export interface DeviceManifest {
  device_id: string
  asset_id: string
  vendor: string
  series: DeviceSeries[]
}

export interface DeviceRecord {
  id: string
  device_id: string
  asset_id: string
  vendor: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Request failed (${res.status})`)
  }
  return res.json()
}

export const devicesService = {
  listPending: async (): Promise<DeviceRecord[]> => {
    if (USE_MOCK) return Promise.resolve(mockDevices.filter((d) => d.status === 'pending'))
    return json(await fetch('/api/devices?pending=true'))
  },
  list: async (): Promise<DeviceRecord[]> => {
    if (USE_MOCK) return Promise.resolve(mockDevices)
    return json(await fetch('/api/devices'))
  },
  approve: async (id: string): Promise<DeviceRecord> => {
    if (USE_MOCK) {
      const device = mockDevices.find((d) => d.id === id)
      if (!device) return Promise.reject(new Error('Device not found'))
      device.status = 'approved'
      return Promise.resolve(device)
    }
    return json(await fetch(`/api/devices/${encodeURIComponent(id)}/approve`, { method: 'POST' }))
  },
  registerManifest: async (manifest: DeviceManifest): Promise<DeviceRecord> => {
    if (USE_MOCK) {
      const record: DeviceRecord = {
        id: manifest.asset_id,
        device_id: manifest.device_id,
        asset_id: manifest.asset_id,
        vendor: manifest.vendor,
        status: 'pending',
        created_at: new Date().toISOString(),
      }
      mockDevices.unshift(record)
      return Promise.resolve(record)
    }
    return json(await fetch('/api/devices/manifest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(manifest),
    }))
  },
}
