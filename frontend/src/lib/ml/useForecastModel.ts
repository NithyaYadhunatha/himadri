// src/lib/forecast/useForecastModel.ts
//
// Loads public/models/forecast-model.json once per page load (module-level
// promise) and hands it to whichever component asks. The file is the output of
// backend/ml/train_forecast.py — see engine.ts for how it is evaluated.
'use client'

import { useEffect, useState } from 'react'
import type { ForecastModel } from './engine'

let cached: Promise<ForecastModel> | null = null

export function loadForecastModel(): Promise<ForecastModel> {
  if (!cached) {
    cached = fetch('/models/forecast-model.json').then((r) => {
      if (!r.ok) throw new Error(`Forecast model unavailable (${r.status}). Run backend/ml/train_forecast.py.`)
      return r.json() as Promise<ForecastModel>
    })
    cached.catch(() => { cached = null })
  }
  return cached
}

export function useForecastModel() {
  const [model, setModel] = useState<ForecastModel | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    loadForecastModel()
      .then((m) => { if (live) setModel(m) })
      .catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : 'Failed to load forecast model') })
    return () => { live = false }
  }, [])
  return { model, error }
}
