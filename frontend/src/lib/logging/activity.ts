// src/lib/logging/activity.ts
//
// The single entry point for writing rows to ActivityLog. Every mutating API
// route added by Phases 1–8 (architecture create/update/delete/share,
// simulation.analyze, shadow_run.start, remediation.execute, node_work.execute,
// member.approve/revoke, invitation.send/revoke, node_business_meta.update, …)
// must call this. Per the Phase 0 plan the actor is resolved via
// getCurrentMembership() so the row records who *actually* took the action
// (keyed off the authenticated Clerk session), not whatever the caller-
// provided body claimed.
//
// The default department stamped onto the row is the actor's department at
// the time of the action. This is denormalization on purpose: a user's
// department can change (admin reassignment), and the Phase 5 /logs page must
// show the department under which the action was *taken*, not the actor's
// current department when someone reads the log later.
//
// Callers may override `department` when the action is genuinely cross-
// department — for example an ADMIN-department user approving a member for
// NETWORK_ENGINEERING should record NETWORK_ENGINEERING on the row so the
// affected department's admins see it in their scoped view. Pass
// `department: null` explicitly for org-wide actions where no dept scope
// applies (bulk ops, system events).
//
// Naming convention for `action`: `entity.verb`, all lowercase — e.g.
//   architecture.create, architecture.share, simulation.analyze,
//   shadow_run.start, remediation.execute, node_work.execute,
//   member.approve, member.revoke, invitation.send, invitation.revoke,
//   node_business_meta.update.
// `targetType` is the Mongoose model name of the mutated collection, or an
// external entity name (`Node`, `Invitation`) when the target lives outside
// Mongo. See ActivityLog.ts for the schema-level rationale.
//
// Errors are NOT swallowed. A failed audit-log write is a real problem — a
// silently-lost row makes the /logs page lie about history — so the caller
// decides whether to try/catch and continue or 500 the request. Mongoose's
// own errors (validation, connection) surface as-is; a missing actor throws
// a clear message rather than writing a row with no actor.

import { Types } from 'mongoose'
import { dbConnect } from '@/lib/mongodb'
import { ActivityLog, type ActivityLogDoc } from '@/lib/models/ActivityLog'
import { getCurrentMembership, type ActiveMembership } from '@/lib/auth/rbac'
import type { Department } from '@/lib/auth/constants'

export interface LogActivityInput {
  action: string
  targetType: string
  targetId?: string | null
  metadata?: unknown
  // Omit to inherit the actor's current department. Pass an explicit
  // Department to record a cross-department action against the affected
  // department. Pass `null` for org-wide actions with no dept scope.
  department?: Department | null
  // Reuse a membership the caller already resolved (e.g. via requireRole /
  // requirePermission / requireActiveMembership) to skip a second Clerk +
  // Mongo round-trip inside the same request.
  actor?: ActiveMembership
}

export async function logActivity(input: LogActivityInput): Promise<ActivityLogDoc> {
  const actor = input.actor ?? (await getCurrentMembership())
  if (!actor) {
    // Mutating routes are gated by requireActiveMembership / requireRole /
    // requirePermission upstream, so reaching here means either the caller
    // forgot to gate or the session expired between the gate and the log
    // write. Either way the write must not silently succeed with a missing
    // actor — the row would render as a ghost on the /logs page.
    throw new Error('logActivity: no active membership on the request; cannot record actor')
  }

  await dbConnect()

  const department = input.department === undefined ? actor.department : input.department

  const doc = await ActivityLog.create({
    actorId: new Types.ObjectId(actor.userId),
    actorEmail: actor.email,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    metadata: input.metadata ?? null,
    department,
  })

  return doc
}
