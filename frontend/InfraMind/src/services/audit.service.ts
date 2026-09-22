// src/services/audit.service.ts
//
// Real backend audit trail — GET /audit (privileged-action log) and
// GET /audit/verify (tamper-evident hash-chain check). Distinct from the
// Mongo-backed ActivityLog on /logs, which is a generic UI-action log for
// non-privileged activity. Falls back to lib/mockData/mockAudit.ts (a real,
// self-verifying SHA-256 hash chain) when NEXT_PUBLIC_USE_MOCK is set.

import { USE_MOCK } from '@/lib/constants'
import { mockAuditLog, mockVerifyChain } from '@/lib/mockData/mockAudit'

export interface AuditEntry {
  seq: number
  actor: string
  action: string
  target: string | null
  station_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  hash: string
}

export interface AuditVerifyResult {
  valid: boolean
  checked: number
  broken_at_seq: number | null
  message: string
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Request failed (${res.status})`)
  }
  return res.json()
}

export const auditService = {
  list: async (station?: string): Promise<AuditEntry[]> => {
    if (USE_MOCK) {
      return Promise.resolve(station ? mockAuditLog.filter((e) => e.station_id === station) : mockAuditLog)
    }
    const qs = station ? `?station=${encodeURIComponent(station)}` : ''
    return json(await fetch(`/api/audit${qs}`))
  },
  verify: async (): Promise<AuditVerifyResult> => {
    if (USE_MOCK) return Promise.resolve(mockVerifyChain())
    return json(await fetch('/api/audit/verify'))
  },
}
