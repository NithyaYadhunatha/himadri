// src/lib/mockData/mockTeamAdmin.ts
//
// In-memory mock backing for /admin/team's RBAC-management section (pending
// signups / active members / outstanding invitations) — this is genuinely
// Mongo+Clerk-backed data in real mode (see src/app/api/admin/{pending-users,
// members,invitations}/route.ts) with no established mock-data path before
// now, so the page hard-crashed under DEV_BYPASS_AUTH/USE_MOCK (calling
// `.json()` on an empty/failed response). Mutations below are real array
// operations against this module's state, not a canned static list, so
// approve/revoke/invite genuinely change what the page shows next render —
// matching commands.service.ts's own mock-state-machine convention.
import type { Department, Role } from '@/lib/auth/constants'

export interface MockPendingUser {
  membershipId: string
  clerkUserId: string
  email: string
  name: string
  createdAt: string | null
}

export interface MockActiveMember {
  membershipId: string
  clerkUserId: string
  email: string
  name: string
  department: Department
  role: Role
  activatedAt: string | null
}

export interface MockInvitedUser {
  id: string
  email: string
  department: Department | null
  role: Role | null
  createdAt: number | null
}

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3_600_000).toISOString()
}

const mockMembers: MockActiveMember[] = [
  { membershipId: 'mem-1', clerkUserId: 'clerk-1', email: 'station.leader@maitri.ncpor.gov.in', name: 'Arjun Mehta', department: 'MAITRI', role: 'STATION_LEADER', activatedAt: hoursAgo(2400) },
  { membershipId: 'mem-2', clerkUserId: 'clerk-2', email: 'priya.nair@maitri.ncpor.gov.in', name: 'Priya Nair', department: 'MAITRI', role: 'ENGINEER', activatedAt: hoursAgo(2200) },
  { membershipId: 'mem-3', clerkUserId: 'clerk-3', email: 'station.leader@bharati.ncpor.gov.in', name: 'Kavya Reddy', department: 'BHARATI', role: 'STATION_LEADER', activatedAt: hoursAgo(2100) },
  { membershipId: 'mem-4', clerkUserId: 'clerk-4', email: 'hq.ops@ncpor.gov.in', name: 'Suresh Rao', department: 'HQ_NCPOR', role: 'HQ_OPERATOR', activatedAt: hoursAgo(3000) },
  { membershipId: 'mem-5', clerkUserId: 'clerk-5', email: 'auditor@ncpor.gov.in', name: 'Meera Iyer', department: 'HQ_NCPOR', role: 'AUDITOR', activatedAt: hoursAgo(1800) },
]

const mockPending: MockPendingUser[] = [
  { membershipId: 'pend-1', clerkUserId: 'clerk-p1', email: 'new.scientist@bharati.ncpor.gov.in', name: 'Devika Menon', createdAt: hoursAgo(6) },
]

const mockInvited: MockInvitedUser[] = [
  { id: 'inv-1', email: 'field.engineer@maitri.ncpor.gov.in', department: 'MAITRI', role: 'ENGINEER', createdAt: Date.now() - 26 * 3_600_000 },
]

function matches(q: string, ...fields: (string | null | undefined)[]): boolean {
  if (!q) return true
  const needle = q.toLowerCase()
  return fields.some((f) => f?.toLowerCase().includes(needle))
}

export const mockTeamAdmin = {
  load: (q: string) => ({
    pending: mockPending.filter((p) => matches(q, p.name, p.email)),
    members: mockMembers.filter((m) => matches(q, m.name, m.email)),
    invited: mockInvited.filter((i) => matches(q, i.email)),
  }),

  approve: (membershipId: string, department: Department, role: Role) => {
    const idx = mockPending.findIndex((p) => p.membershipId === membershipId)
    if (idx === -1) return
    const [p] = mockPending.splice(idx, 1)
    mockMembers.push({
      membershipId: p.membershipId,
      clerkUserId: p.clerkUserId,
      email: p.email,
      name: p.name,
      department,
      role,
      activatedAt: new Date().toISOString(),
    })
  },

  reject: (membershipId: string) => {
    const idx = mockPending.findIndex((p) => p.membershipId === membershipId)
    if (idx !== -1) mockPending.splice(idx, 1)
  },

  revokeMember: (membershipId: string) => {
    const idx = mockMembers.findIndex((m) => m.membershipId === membershipId)
    if (idx !== -1) mockMembers.splice(idx, 1)
  },

  revokeInvite: (id: string) => {
    const idx = mockInvited.findIndex((i) => i.id === id)
    if (idx !== -1) mockInvited.splice(idx, 1)
  },

  sendInvite: (email: string, department: Department, role: Role) => {
    mockInvited.push({ id: `inv-mock-${Date.now()}`, email, department, role, createdAt: Date.now() })
  },
}
