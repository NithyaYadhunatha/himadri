// src/lib/models/ActivityLog.ts
//
// One row per mutating action across the app — the source of truth for the
// Phase 5 /logs page, which filters by actor / action / date / department.
// Every mutating API route added by later phases must call
// src/lib/logging/activity.ts's logActivity() (next task in Phase 0) to append
// a row here.
//
// action / targetType are plain String on purpose: the set of things worth
// logging is intentionally open (architecture.create, simulation.analyze,
// shadow_run.start, remediation.execute, node_work.execute, member.approve,
// invitation.revoke, …) and grows every time a new mutating route is added.
// A closed enum here would put every new phase on the hook for a schema
// change; a naming convention (`entity.verb`) captured in code review is
// enough. targetType similarly maps to whichever collection was mutated
// (Architecture, SimulationRun, ShadowRun, NodeBusinessMeta, NodeWorkProfile,
// Membership, Invitation, …).
//
// actorEmail is denormalized from User so a log row remains readable after
// the User doc is deleted or revoked — the log is history and must not lose
// meaning when its subject leaves.
//
// targetId is a String (not ObjectId) so it can hold either a Mongo _id
// (stringified by the caller) or a foreign key (node key from FastAPI, Clerk
// invitation id, etc.) without a discriminator. Nullable because some events
// (e.g. a bulk operation, a session event) don't point at one specific row.
//
// metadata is Mixed: the shape depends on the action — a share event carries
// recipient ids, an analyze event carries riskScore + blast radius size, a
// remediation event carries the runbook step list. Duplicating each into a
// strict subdocument schema would just mean a migration per new action.
//
// department reuses DEPARTMENTS from lib/auth/constants.ts (already client-
// importable) and is nullable so a cross-department admin action isn't forced
// to pick a scope it doesn't have.

import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'
import { DEPARTMENTS } from '@/lib/auth/constants'

export { DEPARTMENTS }
export type { Department } from '@/lib/auth/constants'

const ActivityLogSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actorEmail: { type: String, required: true, index: true },
    action: { type: String, required: true, index: true },
    targetType: { type: String, required: true, index: true },
    targetId: { type: String, default: null, index: true },
    metadata: { type: Schema.Types.Mixed, default: null },
    department: { type: String, enum: DEPARTMENTS, default: null, index: true },
  },
  { timestamps: true },
)

export type ActivityLogDoc = InferSchemaType<typeof ActivityLogSchema>

export const ActivityLog =
  (models.ActivityLog as Model<ActivityLogDoc>) ??
  model<ActivityLogDoc>('ActivityLog', ActivityLogSchema)
