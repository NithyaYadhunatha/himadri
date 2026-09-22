// src/app/logs/layout.tsx
//
// /logs is admin-only: it exposes the full ActivityLog across all actors and
// departments. Non-admin active members are redirected to /digital-twin rather
// than /waiting-approval (they're already active — they just lack the role).
import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { requireActiveMembership } from '@/lib/auth/rbac'

const LOGS_ROLES = ['STATION_LEADER', 'HQ_OPERATOR', 'AUDITOR']

export default async function LogsLayout({ children }: { children: ReactNode }) {
  const membership = await requireActiveMembership()
  if (!LOGS_ROLES.includes(membership.role)) {
    redirect('/twin')
  }
  return <>{children}</>
}
