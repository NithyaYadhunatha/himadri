// src/lib/models/Membership.ts
//
// The actual access-control record. New authenticated users receive the
// read-only HQ_NCPOR/AUDITOR default; explicit invitations and ADMIN_EMAILS
// can grant broader roles. See lib/auth/rbac.ts and lib/auth/permissions.ts.

import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'
import { DEPARTMENTS, ROLES, STATUSES } from '@/lib/auth/constants'

export { DEPARTMENTS, ROLES, STATUSES }
export type { Department, Role, MembershipStatus } from '@/lib/auth/constants'

const MembershipSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  clerkUserId: { type: String, required: true, index: true },
  department: { type: String, enum: DEPARTMENTS, default: null },
  role: { type: String, enum: ROLES, default: null },
  status: { type: String, enum: STATUSES, default: 'PENDING' },
  invitedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  invitedAt: { type: Date, default: null },
  activatedAt: { type: Date, default: null },
})

export type MembershipDoc = InferSchemaType<typeof MembershipSchema>

export const Membership =
  (models.Membership as Model<MembershipDoc>) ?? model<MembershipDoc>('Membership', MembershipSchema)
