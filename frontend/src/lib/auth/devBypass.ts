// src/lib/auth/devBypass.ts
//
// Local-dev-only escape hatch: when NEXT_PUBLIC_DEV_BYPASS_AUTH=true, every
// Clerk/Mongo-backed auth check in this app short-circuits to a fake ACTIVE
// membership instead of touching Clerk or MongoDB — for running this Next.js
// app completely standalone (no Clerk keys, no Mongo, no FastAPI backend),
// e.g. to click through the UI against mock data.
//
// Must default to OFF and only ever be flipped on by an explicit env var —
// never make this the default behavior. NEXT_PUBLIC_ prefix is required
// because it's read from both server code (middleware, rbac.ts) and client
// code (Navbar's UserButton swap).

import type { ActiveMembership } from '@/lib/auth/rbacTypes'

export const DEV_BYPASS_AUTH = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true'

export const MOCK_MEMBERSHIP: ActiveMembership = {
  membershipId: 'dev-bypass-membership',
  userId: 'dev-bypass-user',
  clerkUserId: 'dev-bypass-user',
  email: 'dev@himadri.local',
  name: 'Dev Tester',
  department: 'MAITRI',
  role: 'STATION_LEADER',
  status: 'ACTIVE',
}
