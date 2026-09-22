// src/services/diagnosis.service.ts
//
// Guided fault diagnosis — POST /analytics/diagnose. Falls back to
// lib/mockData/mockDiagnosis.ts (a faithful port of the backend's curated
// diagnosis_engine.py rules) when NEXT_PUBLIC_USE_MOCK is set.

import { USE_MOCK } from '@/lib/constants'
import { mockDiagnose } from '@/lib/mockData/mockDiagnosis'
import { mockNodes } from '@/lib/mockData/mockGraph'

export interface DiagnosisRequest {
  asset_id?: string
  category?: string
  subtype?: string
  evidence?: string[]
}

export interface DiagnosisCause {
  cause: string
  score_pct: number
  matched_evidence: string[]
  check_sequence: string[]
}

export interface DiagnosisResult {
  asset_id: string | null
  category: string | null
  subtype: string | null
  causes: DiagnosisCause[]
}

export const diagnosisService = {
  diagnose: async (input: DiagnosisRequest): Promise<DiagnosisResult> => {
    if (USE_MOCK) {
      let category = input.category
      let subtype = input.subtype
      if (input.asset_id && (!category || !subtype)) {
        const asset = mockNodes.find((n) => n.id === input.asset_id)
        if (asset) {
          category = category ?? asset.type
          subtype = subtype ?? asset.subtype
        }
      }
      const observedEvidence = Object.fromEntries((input.evidence ?? []).map((e) => [e, true]))
      const result = mockDiagnose(category, subtype, observedEvidence)
      return Promise.resolve({ ...result, asset_id: input.asset_id ?? null })
    }
    const res = await fetch('/api/analytics/diagnose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? `Diagnosis failed (${res.status})`)
    }
    return res.json()
  },
}
