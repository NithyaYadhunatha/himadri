// src/services/remediation.service.ts
//
// Client-side service for remediation actions. All routes point at the
// Next.js API layer (not the FastAPI backend, which has no /remediation/*
// endpoints). Uses fetch instead of the axios `api` client because these
// are internal Next.js routes, not the Python backend.

import { USE_MOCK } from '@/lib/constants'
import type { RemediationAction } from '@/types/nodes'

export const remediationService = {
  // Fetch node-specific remediation recommendations derived from real blast
  // radius + node health. Called by nodeHealthService.getRemediationActions().
  getNodeRecs: async (nodeId: string): Promise<RemediationAction[]> => {
    const res = await fetch(`/api/remediation/recommendations?nodeId=${encodeURIComponent(nodeId)}`)
    if (!res.ok) throw new Error(`Recommendations fetch failed: ${res.status}`)
    const data = await res.json() as { actions: RemediationAction[] }
    return data.actions
  },

  // Execute a remediation action. Writes an ActivityLog row server-side and
  // returns a task handle. The task is immediately "initiated" — there is no
  // real backend task runner behind this yet; the log row is the receipt.
  executeAction: async (
    actionId: string,
    nodeId: string,
    actionName?: string,
  ): Promise<{ taskId: string; status: string }> => {
    if (USE_MOCK) {
      return Promise.resolve({ taskId: `task-${Date.now()}`, status: 'initiated' })
    }
    const res = await fetch('/api/remediation/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionId, nodeId, actionName }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string }
      throw new Error(err.error ?? `Execute failed: ${res.status}`)
    }
    return res.json() as Promise<{ taskId: string; status: string }>
  },

  // Poll the status of an in-progress remediation task. Returns a synthetic
  // "completed" state because there is no real task runner — execute's
  // ActivityLog row is already the final receipt.
  getActionStatus: async (): Promise<{ status: string; progress: number; message: string }> => {
    return Promise.resolve({ status: 'completed', progress: 100, message: 'Action initiated successfully.' })
  },

  // Generate a runbook for a given action id.
  generateRunbook: async (actionId: string): Promise<{ title: string; steps: string[] }> => {
    if (USE_MOCK) {
      return Promise.resolve({
        title: `Runbook for ${actionId}`,
        steps: ['Review system health', 'Execute remediation steps', 'Monitor recovery'],
      })
    }
    const res = await fetch(`/api/remediation/runbook?actionId=${encodeURIComponent(actionId)}`)
    if (!res.ok) throw new Error(`Runbook fetch failed: ${res.status}`)
    return res.json() as Promise<{ title: string; steps: string[] }>
  },
}
