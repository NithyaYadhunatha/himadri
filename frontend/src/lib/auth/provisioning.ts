// src/lib/auth/provisioning.ts
//
// Shared logic for deciding a Membership's initial (or self-healed) state,
// used by both the Clerk webhook (src/app/api/webhooks/clerk/route.ts) and
// the lazy on-login path (src/lib/auth/rbac.ts's ensureMembership) so the
// two never drift.
//
// Two ways a brand-new signup can skip the PENDING waiting room:
// 1. Bootstrap admin — email is in ADMIN_EMAILS (see project spec).
// 2. Email invite — an admin pre-assigned department/role via
//    /api/admin/invite-email, which stamps them onto the Clerk invitation's
//    publicMetadata; Clerk carries that onto the resulting User, so it shows
//    up here as `publicMetadata.invitedDepartment` / `invitedRole` the
//    moment the invited person actually signs up.

import { DEPARTMENTS, ROLES, type Department, type Role } from '@/lib/auth/constants'

export interface ProvisionedState {
  department: Department | null
  role: Role | null
  status: 'ACTIVE' | 'PENDING'
  invitedByEmail: string | null
}

export function parseAdminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  )
}

export function resolveInitialMembershipState(
  email: string,
  publicMetadata: Record<string, unknown> | null | undefined
): ProvisionedState {
  if (email !== '' && parseAdminEmails().has(email.toLowerCase())) {
    // No 'ADMIN' role exists in HIMADRI's five-role RBAC — HQ_OPERATOR is the
    // broadest role (cross-station visibility, team management, device/alert
    // admin) and the closest analog for a bootstrap system administrator.
    return { department: 'ADMIN', role: 'HQ_OPERATOR', status: 'ACTIVE', invitedByEmail: null }
  }

  const invitedDepartment = publicMetadata?.invitedDepartment
  const invitedRole = publicMetadata?.invitedRole

  if (
    typeof invitedDepartment === 'string' &&
    (DEPARTMENTS as readonly string[]).includes(invitedDepartment) &&
    typeof invitedRole === 'string' &&
    (ROLES as readonly string[]).includes(invitedRole)
  ) {
    const invitedByEmail = publicMetadata?.invitedByEmail
    return {
      department: invitedDepartment as Department,
      role: invitedRole as Role,
      status: 'ACTIVE',
      invitedByEmail: typeof invitedByEmail === 'string' ? invitedByEmail : null,
    }
  }

  return { department: null, role: null, status: 'PENDING', invitedByEmail: null }
}
