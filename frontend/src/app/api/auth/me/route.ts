// src/app/api/auth/me/route.ts
//
// Lightweight endpoint returning the current user's role and admin flag so
// client components (e.g. Navbar) can gate admin-only links without a server
// round-trip on every render. Returns { role: null } for unauthenticated /
// PENDING members so callers can default to the least-privileged view.

import { NextResponse } from 'next/server'
import { getCurrentMembership } from '@/lib/auth/rbac'
import { canViewAllStations, ownStationId } from '@/lib/graph/departmentScope'

export async function GET() {
  const membership = await getCurrentMembership()
  if (!membership) {
    return NextResponse.json({
      role: null,
      department: null,
      isAdmin: false,
      canViewAllStations: false,
      ownStation: null,
    })
  }
  return NextResponse.json({
    role: membership.role,
    department: membership.department,
    isAdmin: membership.role === 'STATION_LEADER' || membership.role === 'HQ_OPERATOR',
    // Whether this membership may switch between stations at all (HQ
    // Operator/Auditor/Admin), vs. being permanently locked to one — see
    // lib/graph/departmentScope.ts, the actual server-side enforcement
    // point every station-scoped proxy route checks against.
    canViewAllStations: canViewAllStations(membership),
    ownStation: ownStationId(membership),
  })
}
