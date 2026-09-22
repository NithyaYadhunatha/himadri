// src/services/alerts.service.ts
//
// Dedicated Alerts page — GET /alerts with filters, ack with a note, resolve.
// Falls back to lib/mockData/mockAlerts.ts when NEXT_PUBLIC_USE_MOCK is set.
import { USE_MOCK } from '@/lib/constants'
import { mockAlerts } from '@/lib/mockData/mockAlerts'
import type { BackendAlertDetail } from '@/lib/backendAdapters'

export interface AlertFilters {
  station?: string
  severity?: string
  category?: string
  state?: string
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Request failed (${res.status})`)
  }
  return res.json()
}

function findMockAlert(id: string): BackendAlertDetail | undefined {
  return mockAlerts.find((a) => a.id === id)
}

export const alertsService = {
  list: async (filters: AlertFilters): Promise<BackendAlertDetail[]> => {
    if (USE_MOCK) {
      return Promise.resolve(
        mockAlerts.filter((a) => {
          if (filters.station && a.station_id !== filters.station) return false
          if (filters.severity && a.severity !== filters.severity) return false
          if (filters.category && a.category !== filters.category) return false
          if (filters.state && a.state !== filters.state) return false
          return true
        }),
      )
    }
    const qs = new URLSearchParams()
    if (filters.station) qs.set('station', filters.station)
    if (filters.severity) qs.set('severity', filters.severity)
    if (filters.category) qs.set('category', filters.category)
    if (filters.state) qs.set('state', filters.state)
    const search = qs.toString()
    return json(await fetch(`/api/alerts${search ? `?${search}` : ''}`))
  },

  ack: async (id: string, note?: string): Promise<BackendAlertDetail> => {
    if (USE_MOCK) {
      const alert = findMockAlert(id)
      if (!alert) return Promise.reject(new Error('Alert not found'))
      alert.state = 'acked'
      alert.acked_by = 'Dev Tester'
      alert.acked_at = new Date().toISOString()
      alert.ack_note = note ?? ''
      return Promise.resolve(alert)
    }
    return json(await fetch(`/api/alerts/${encodeURIComponent(id)}/ack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: note ?? '' }),
    }))
  },

  resolve: async (id: string): Promise<BackendAlertDetail> => {
    if (USE_MOCK) {
      const alert = findMockAlert(id)
      if (!alert) return Promise.reject(new Error('Alert not found'))
      alert.state = 'resolved'
      return Promise.resolve(alert)
    }
    return json(await fetch(`/api/alerts/${encodeURIComponent(id)}/resolve`, { method: 'POST' }))
  },
}
