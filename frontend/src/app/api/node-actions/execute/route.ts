// src/app/api/node-actions/execute/route.ts
//
// POST — execute a node action and write an ActivityLog row.
// Any ACTIVE member may execute; the actor is resolved from the Clerk session
// so the log row records who actually clicked Execute, not a caller-supplied id.
// The route does not reach out to FastAPI — action execution is a front-end
// audit event; real side-effects (e.g. an actual restart) would go through
// the agent layer, which is separate.

import { type NextRequest, NextResponse } from 'next/server'
import { getCurrentMembership } from '@/lib/auth/rbac'
import { logActivity } from '@/lib/logging/activity'

export const runtime = 'nodejs'

interface ExecuteBody {
  nodeKey?: unknown
  actionId?: unknown
  actionLabel?: unknown
  nodeType?: unknown
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const membership = await getCurrentMembership()
  if (!membership || membership.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as ExecuteBody
  const { nodeKey, actionId, actionLabel, nodeType } = body

  if (
    typeof nodeKey !== 'string' || !nodeKey ||
    typeof actionId !== 'string' || !actionId ||
    typeof actionLabel !== 'string' || !actionLabel
  ) {
    return NextResponse.json(
      { error: 'Missing required fields: nodeKey, actionId, actionLabel' },
      { status: 400 },
    )
  }

  await logActivity({
    action: 'node_action.execute',
    targetType: 'node',
    targetId: nodeKey,
    metadata: {
      actionId,
      actionLabel,
      nodeType: typeof nodeType === 'string' ? nodeType : undefined,
    },
    actor: membership,
  })

  return NextResponse.json({
    ok: true,
    message: `Action "${actionLabel}" executed on ${nodeKey}`,
  })
}
