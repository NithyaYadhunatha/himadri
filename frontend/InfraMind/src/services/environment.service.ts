// src/services/environment.service.ts
//
// Environmental Monitoring — waste/carbon reporting, advisories, and live
// regional weather. Backs the /environment page (instrument health reuses
// nodeHealthService/graphService against category=instrument instead of a
// dedicated service). Waste/advisories/reports fall back to
// lib/mockData/mockEnvironment.ts when NEXT_PUBLIC_USE_MOCK is set; live
// weather never does — it always hits /api/environment/weather (real
// Open-Meteo data for the station's real coordinates), since a synthetic
// weather number would defeat the point of a "live conditions" feature.

import { USE_MOCK } from '@/lib/constants'
import { mockWaste, mockAdvisories, mockReports } from '@/lib/mockData/mockEnvironment'

export interface StationWeather {
  station: string
  latitude: number
  longitude: number
  temperatureC: number
  feelsLikeC: number
  windSpeedKmh: number
  windGustKmh: number
  windDirectionDeg: number
  humidityPct: number
  pressureHpa: number
  snowfallCm: number
  weatherCode: number
  weatherLabel: string
  isDay: boolean
  observedAt: string
  source: string
}

export interface WasteRecord {
  id: string
  station_id: string
  category: string
  quantity_kg: number
  method: string
  recorded_at: string
}

export interface Advisory {
  id: string
  station_id: string
  kind: string
  message: string
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
}

export interface ReportSummary {
  id: string
  station_id: string
  report_type: string
  generated_at: string
  url: string | null
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Request failed (${res.status})`)
  }
  return res.json()
}

function findAdvisory(id: string): Advisory | undefined {
  for (const list of Object.values(mockAdvisories)) {
    const found = list.find((a) => a.id === id)
    if (found) return found
  }
  return undefined
}

export const environmentService = {
  // Real-time — not gated behind USE_MOCK. Hits the live weather API for
  // the station's actual coordinates.
  getCurrentConditions: async (station: string): Promise<StationWeather> => {
    return json(await fetch(`/api/environment/weather?station=${encodeURIComponent(station)}`))
  },

  getWaste: async (station: string): Promise<WasteRecord[]> => {
    if (USE_MOCK) return Promise.resolve(mockWaste[station] ?? [])
    return json(await fetch(`/api/waste?station=${encodeURIComponent(station)}`))
  },

  getAdvisories: async (station: string): Promise<Advisory[]> => {
    if (USE_MOCK) return Promise.resolve(mockAdvisories[station] ?? [])
    return json(await fetch(`/api/advisories?station=${encodeURIComponent(station)}`))
  },

  acceptAdvisory: async (id: string): Promise<Advisory> => {
    if (USE_MOCK) {
      const advisory = findAdvisory(id)
      if (!advisory) return Promise.reject(new Error('Advisory not found'))
      advisory.status = 'accepted'
      return Promise.resolve(advisory)
    }
    return json(await fetch(`/api/advisories/${encodeURIComponent(id)}/accept`, { method: 'POST' }))
  },

  rejectAdvisory: async (id: string): Promise<Advisory> => {
    if (USE_MOCK) {
      const advisory = findAdvisory(id)
      if (!advisory) return Promise.reject(new Error('Advisory not found'))
      advisory.status = 'rejected'
      return Promise.resolve(advisory)
    }
    return json(await fetch(`/api/advisories/${encodeURIComponent(id)}/reject`, { method: 'POST' }))
  },

  generateReport: async (station: string, reportType: string): Promise<ReportSummary> => {
    if (USE_MOCK) {
      const report: ReportSummary = { id: `${station}-report-${Date.now()}`, station_id: station, report_type: reportType, generated_at: new Date().toISOString(), url: null }
      const list = mockReports[station] ?? (mockReports[station] = [])
      list.unshift(report)
      return Promise.resolve(report)
    }
    return json(await fetch('/api/reports/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ station_id: station, report_type: reportType }),
    }))
  },

  getReports: async (station: string): Promise<ReportSummary[]> => {
    if (USE_MOCK) return Promise.resolve(mockReports[station] ?? [])
    return json(await fetch(`/api/reports?station=${encodeURIComponent(station)}`))
  },
}
