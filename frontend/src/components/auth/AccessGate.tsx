// src/components/auth/AccessGate.tsx
//
// Server component wrapping the authenticated app shell. Redirects to
// /sign-in (no Clerk session) or /waiting-approval (signed in, but no
// admin has assigned a department/role yet) before rendering children.
// Mounted via layout.tsx in every top-level authenticated route group
// (digital-twin, simulation) so no individual page needs to remember to gate.

import type { ReactNode } from 'react'
import { requireActiveMembership } from '@/lib/auth/rbac'

export async function AccessGate({ children }: { children: ReactNode }) {
  await requireActiveMembership()
  return <>{children}</>
}
