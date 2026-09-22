// src/app/api/me/route.ts
//
// Lightweight "who am I" for client components that need the current user's
// department/role without re-implementing the RBAC lookup — e.g. the digital
// twin page's department-scoping indicator and default filter.
import { NextResponse } from 'next/server'
import { getCurrentMembership } from '@/lib/auth/rbac'

export async function GET() {
  const membership = await getCurrentMembership()
  if (!membership) {
    return NextResponse.json({ department: null, role: null })
  }
  return NextResponse.json({ department: membership.department, role: membership.role })
}
