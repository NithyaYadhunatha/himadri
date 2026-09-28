// src/app/api/remediation/execute/route.ts
//
// Records a remediation execution in ActivityLog and returns a task handle.
// There is no FastAPI remediation task-runner endpoint — the action is
// logged here and the caller tracks progress via the returned taskId. A
// future phase could add real task polling (e.g. a MongoDB-backed task
// queue), but for now the task is treated as synchronously initiated: the
// log row is the receipt.
//
// One real side effect: it also tells FastAPI to stop whatever synthetic
// failure simulation is running on this node's agent (POST
// /assets/{id}/stop-simulation), since "execute a remediation action" is
// exactly the demo's "the problem is fixed now" moment. That backend route
// only queues the command — the agent picks it up on its next heartbeat
// (see InfraMind.py's backend/services/pending_commands.py) — so this call
// is fire-and-forget and never blocks or fails the execute response; a node
// with no agent running, or no simulation active, is a normal no-op there.
//
// Body: { actionId: string; nodeId: string; actionName?: string }
// Response: { taskId: string; status: 'initiated'; loggedAt: string }

import { NextResponse } from 'next/server'
import { getCurrentMembership } from '@/lib/auth/rbac'
import { logActivity } from '@/lib/logging/activity'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://himadri.aus1in.me/api/v1'
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN ?? ''

async function queueStopSimulation(nodeId: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/assets/${encodeURIComponent(nodeId)}/stop-simulation`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_TOKEN}` },
      cache: 'no-store',
    })
  } catch {
    // Best-effort — the node may not exist in FastAPI (a Mongo-only
    // scenario-builder node, say) or the backend may be unreachable. The
    // remediation "receipt" (the ActivityLog row) is what execute actually
    // guarantees; this is a bonus real effect when a live agent exists.
  }
}

export async function POST(req: Request) {
  const membership = await getCurrentMembership()
  if (!membership) {
    return NextResponse.json({ error: 'Membership not active' }, { status: 403 })
  }

  let body: { actionId?: string; nodeId?: string; actionName?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { actionId, nodeId, actionName } = body
  if (!actionId || !nodeId) {
    return NextResponse.json({ error: 'actionId and nodeId are required' }, { status: 400 })
  }

  // Write the audit row. logActivity propagates errors on failure — a lost
  // row would make /logs lie about history, so we let it 500 rather than
  // silently swallowing the write failure.
  await logActivity({
    action: 'remediation.execute',
    targetType: 'Node',
    targetId: nodeId,
    metadata: { actionId, actionName: actionName ?? actionId },
    actor: membership,
  })

  await queueStopSimulation(nodeId)

  return NextResponse.json({
    taskId: `task-${Date.now()}`,
    status: 'initiated',
    loggedAt: new Date().toISOString(),
  })
}
