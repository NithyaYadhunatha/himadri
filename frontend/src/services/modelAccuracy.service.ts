// src/services/modelAccuracy.service.ts

import api from '@/lib/axios'
import { USE_MOCK } from '@/lib/constants'
import {
  mockAccuracyMetrics,
  mockPredictions,
  mockDriftMetrics,
  mockForecastSystems,
} from '@/lib/mockData/mockModelAccuracy'
import type {
  AccuracyMetrics,
  PredictionRecord,
  DriftMetrics,
  ForecastResponse,
} from '@/lib/mockData/mockModelAccuracy'
import type { PaginatedResponse } from '@/types/common'

// All routes served by backend/routers/predictive_maintenance.py under prefix /model-accuracy
const BASE = '/api/model-accuracy'

export const modelAccuracyService = {
  getAccuracyMetrics: async (simId?: string): Promise<AccuracyMetrics> => {
    if (USE_MOCK) return Promise.resolve(mockAccuracyMetrics)
    const res = await api.get<AccuracyMetrics>(`${BASE}/accuracy`, { params: { simId } })
    return res.data
  },

  getForecast: async (): Promise<ForecastResponse> => {
    if (USE_MOCK) {
      // Populated forecast, not the empty-systems placeholder this used to
      // return — see mockModelAccuracy.ts's buildForecastSystems() for why
      // it's derived from the live mock graph rather than invented.
      return Promise.resolve({
        generated_at: new Date().toISOString(),
        model_version: 'himadri-gbc-v1.3-mock',
        forecast_horizon: '24h',
        systems: mockForecastSystems,
      })
    }
    const res = await api.get<ForecastResponse>(`${BASE}/forecast`)
    return res.data
  },

  getPredictions: async (
    page = 1,
    pageSize = 8,
    simId?: string
  ): Promise<PaginatedResponse<PredictionRecord>> => {
    if (USE_MOCK) {
      const start = (page - 1) * pageSize
      const paged = mockPredictions.slice(start, start + pageSize)
      return Promise.resolve({
        data: paged,
        total: mockPredictions.length,
        page,
        pageSize,
        hasMore: start + pageSize < mockPredictions.length,
      })
    }
    const res = await api.get<PaginatedResponse<PredictionRecord>>(`${BASE}/predictions`, {
      params: { page, pageSize, simId },
    })
    return res.data
  },

  getDriftMetrics: async (simId?: string): Promise<DriftMetrics> => {
    if (USE_MOCK) return Promise.resolve(mockDriftMetrics)
    const res = await api.get<DriftMetrics>(`${BASE}/drift`, { params: { simId } })
    return res.data
  },

  triggerRetrain: async (): Promise<{ jobId: string }> => {
    if (USE_MOCK) return Promise.resolve({ jobId: `retrain-${Date.now()}` })
    const res = await api.post<{ jobId: string }>(`${BASE}/retrain`)
    return res.data
  },
}
