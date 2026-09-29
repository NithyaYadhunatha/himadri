// src/app/logs/layout.tsx
//
// /logs is admin-only: it exposes the full ActivityLog across all actors and
// departments. Active members without a permitted role are redirected to the
// digital twin.
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
