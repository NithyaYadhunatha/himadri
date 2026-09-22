// src/lib/auth/rbacTypes.ts
//
// ActiveMembership's shape, split out from rbac.ts so devBypass.ts (and
// anything else that needs the type but not rbac.ts's Clerk/Mongo-touching
// functions) can import it without a circular dependency.

import type { Department, Role } from '@/lib/auth/constants'

export interface ActiveMembership {
  membershipId: string
  userId: string
  clerkUserId: string
  email: string
  name: string
  department: Department
  role: Role
  status: 'ACTIVE'
}
