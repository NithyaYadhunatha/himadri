// src/components/auth/AccessGate.tsx
//
// Server component wrapping the authenticated app shell. Unauthenticated
// users go to sign-in; authenticated users receive at least the default
// read-only AUDITOR membership before children render.
// Mounted via layout.tsx in every top-level authenticated route group
// (digital-twin, simulation) so no individual page needs to remember to gate.

import type { ReactNode } from 'react'
import { requireActiveMembership } from '@/lib/auth/rbac'

export async function AccessGate({ children }: { children: ReactNode }) {
  await requireActiveMembership()
  return <>{children}</>
}
