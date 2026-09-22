// src/app/admin/layout.tsx
//
// Admin section requires ACTIVE membership *and* the ADMIN role — not just
// any authenticated user, unlike digital-twin/simulation's AccessGate.

import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { requireActiveMembership } from '@/lib/auth/rbac'

const ADMIN_ROLES = ['STATION_LEADER', 'HQ_OPERATOR']

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const membership = await requireActiveMembership()
  if (!ADMIN_ROLES.includes(membership.role)) {
    redirect('/twin')
  }
  return <>{children}</>
}
