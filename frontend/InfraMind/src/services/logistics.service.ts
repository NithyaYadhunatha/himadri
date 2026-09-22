// src/services/logistics.service.ts
//
// Energy & Logistics Supply Chain — inventory, endurance projection, vehicle
// fleet, and convoy planning. Backs the /logistics page. Falls back to
// lib/mockData/mockLogistics.ts when NEXT_PUBLIC_USE_MOCK is set — writes
// (logCount/createConvoy/assign/depart) just mutate the in-memory mock
// arrays so the page stays interactive without a backend.

import { USE_MOCK } from '@/lib/constants'
import { mockInventory, mockEndurance, mockVehicles, mockConvoys, mockDailyCarbonKg } from '@/lib/mockData/mockLogistics'

export interface InventoryItem {
  id: string
  station_id: string
  category: string
  name: string
  unit: string
  quantity: number
  reorder_threshold: number | null
  last_counted_at: string | null
}

export interface EnduranceProjection {
  station: string
  fuel_days_remaining: number
  food_days_remaining: number
  computed_at: string
}

export interface Vehicle {
  id: string
  station_id: string
  name: string
  vehicle_type: string
  status: string
  fuel_level_percent: number | null
  run_hours: number | null
}

export interface ConvoyMember {
  name: string
  role: string
}

export interface Convoy {
  id: string
  station_id: string
  name: string
  status: string
  vehicle_ids: string[]
  members: ConvoyMember[]
  has_medical_officer: boolean
  has_ambulance_escort: boolean
  departed_at: string | null
  created_at: string
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Request failed (${res.status})`)
  }
  return res.json()
}

export const logisticsService = {
  getInventory: async (station: string): Promise<InventoryItem[]> => {
    if (USE_MOCK) return Promise.resolve(mockInventory[station] ?? [])
    return json(await fetch(`/api/inventory?station=${encodeURIComponent(station)}`))
  },

  logCount: async (id: string, quantity: number): Promise<InventoryItem> => {
    if (USE_MOCK) {
      for (const items of Object.values(mockInventory)) {
        const item = items.find((i) => i.id === id)
        if (item) {
          item.quantity = quantity
          item.last_counted_at = new Date().toISOString()
          return Promise.resolve(item)
        }
      }
      return Promise.reject(new Error('Inventory item not found'))
    }
    return json(await fetch(`/api/inventory/${encodeURIComponent(id)}/count`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity }),
    }))
  },

  getEndurance: async (station: string): Promise<EnduranceProjection> => {
    if (USE_MOCK) return Promise.resolve(mockEndurance[station] ?? mockEndurance.maitri)
    return json(await fetch(`/api/logistics/endurance?station=${encodeURIComponent(station)}`))
  },

  // No live backend endpoint for this yet (honest gap) — mock mode derives
  // a steady-state estimate from the same fuel-burn constants
  // scenario_engine.py uses (see mockDailyCarbonKg's header comment).
  getDailyCarbonKg: async (station: string): Promise<number | null> => {
    if (USE_MOCK) return Promise.resolve(mockDailyCarbonKg(station))
    return Promise.resolve(null)
  },

  getVehicles: async (station: string): Promise<Vehicle[]> => {
    if (USE_MOCK) return Promise.resolve(mockVehicles[station] ?? [])
    return json(await fetch(`/api/vehicles?station=${encodeURIComponent(station)}`))
  },

  getConvoys: async (station: string): Promise<Convoy[]> => {
    if (USE_MOCK) return Promise.resolve(mockConvoys[station] ?? [])
    return json(await fetch(`/api/convoys?station=${encodeURIComponent(station)}`))
  },

  createConvoy: async (input: { station_id: string; name: string }): Promise<Convoy> => {
    if (USE_MOCK) {
      const convoy: Convoy = {
        id: `${input.station_id}-convoy-${Date.now()}`,
        station_id: input.station_id,
        name: input.name,
        status: 'planned',
        vehicle_ids: [],
        members: [],
        has_medical_officer: false,
        has_ambulance_escort: false,
        departed_at: null,
        created_at: new Date().toISOString(),
      }
      const list = mockConvoys[input.station_id] ?? (mockConvoys[input.station_id] = [])
      list.unshift(convoy)
      return Promise.resolve(convoy)
    }
    return json(await fetch('/api/convoys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }))
  },

  assignToConvoy: async (id: string, input: { vehicle_ids?: string[]; members?: ConvoyMember[] }): Promise<Convoy> => {
    if (USE_MOCK) {
      for (const convoys of Object.values(mockConvoys)) {
        const convoy = convoys.find((c) => c.id === id)
        if (convoy) {
          if (input.vehicle_ids) convoy.vehicle_ids = [...new Set([...convoy.vehicle_ids, ...input.vehicle_ids])]
          if (input.members) convoy.members = [...convoy.members, ...input.members]
          convoy.has_medical_officer = convoy.members.some((m) => m.role.toLowerCase().includes('medical'))
          const allVehicles = Object.values(mockVehicles).flat()
          convoy.has_ambulance_escort = convoy.vehicle_ids.some((vid) => allVehicles.find((v) => v.id === vid)?.vehicle_type === 'ambulance')
          return Promise.resolve(convoy)
        }
      }
      return Promise.reject(new Error('Convoy not found'))
    }
    return json(await fetch(`/api/convoys/${encodeURIComponent(id)}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }))
  },

  departConvoy: async (id: string): Promise<Convoy> => {
    if (USE_MOCK) {
      for (const convoys of Object.values(mockConvoys)) {
        const convoy = convoys.find((c) => c.id === id)
        if (convoy) {
          if (!convoy.has_medical_officer) return Promise.reject(new Error('Convoy has no medical officer assigned'))
          if (!convoy.has_ambulance_escort) return Promise.reject(new Error('Convoy has no ambulance escort'))
          convoy.status = 'underway'
          convoy.departed_at = new Date().toISOString()
          return Promise.resolve(convoy)
        }
      }
      return Promise.reject(new Error('Convoy not found'))
    }
    const res = await fetch(`/api/convoys/${encodeURIComponent(id)}/depart`, { method: 'PATCH' })
    // The backend's medical-officer/ambulance-escort validation surfaces as a
    // 400 with a human-readable message — relay it verbatim rather than a
    // generic "request failed" so the planner knows exactly what to fix.
    return json(res)
  },
}
