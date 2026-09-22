// src/lib/mockData/mockDevices.ts
//
// Frontend-only fallback pending-device-approval queue for /admin/devices,
// gated by NEXT_PUBLIC_USE_MOCK — a couple of newly self-registered devices
// (FR-99…102) awaiting a Station Leader/HQ Operator's approval.
import type { DeviceRecord } from '@/services/devices.service'

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 3600_000).toISOString()

export const mockDevices: DeviceRecord[] = [
  { id: 'maitri-instrument-radiosonde-01', device_id: 'RS-4471', asset_id: 'maitri-instrument-radiosonde-01', vendor: 'Vaisala', status: 'pending', created_at: daysAgo(1) },
  { id: 'bharati-instrument-ozone-monitor-01', device_id: 'OZ-2209', asset_id: 'bharati-instrument-ozone-monitor-01', vendor: 'Thermo Fisher', status: 'pending', created_at: daysAgo(2) },
  { id: 'maitri-power-solar-array-01', device_id: 'SLR-0091', asset_id: 'maitri-power-solar-array-01', vendor: 'NCPOR Fab', status: 'approved', created_at: daysAgo(14) },
]
