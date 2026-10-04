// src/app/api/admin/invite-email/route.ts
//
// Creates a Clerk invitation with the department/role pre-assigned in the
// invitation's publicMetadata. When the invitee signs up, Clerk carries that
// metadata onto the User and lib/auth/provisioning.ts lands them ACTIVE with the
// chosen department/role (no second approval step).
import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/rbac'
import { DEV_BYPASS_AUTH } from '@/lib/auth/devBypass'
import { DEPARTMENTS, ROLES } from '@/lib/auth/constants'

export async function POST(req: Request) {
  const check = await requireRole(['STATION_LEADER', 'HQ_OPERATOR'])
  if (!check.ok) return check.response

  const body = await req.json().catch(() => null)
  const { email, department, role } = (body ?? {}) as { email?: string; department?: string; role?: string }

  if (!email || typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  }
  if (!department || !(DEPARTMENTS as readonly string[]).includes(department)) {
    return NextResponse.json({ error: 'Invalid department' }, { status: 400 })
  }
  if (!role || !(ROLES as readonly string[]).includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  // Local-dev-only: no Clerk keys under DEV_BYPASS_AUTH, so there is no real
  // invitation to create. Acknowledge so the UI flow can be exercised.
  if (DEV_BYPASS_AUTH) return NextResponse.json({ ok: true, simulated: true })

  try {
    const { clerkClient } = await import('@clerk/nextjs/server')
    const clerk = await clerkClient()
    const invitation = await clerk.invitations.createInvitation({
      emailAddress: email,
      publicMetadata: {
        invitedDepartment: department,
        invitedRole: role,
        invitedByEmail: check.membership.email ?? null,
      },
      ignoreExisting: true,
      notify: true,
    })
    return NextResponse.json({ ok: true, id: invitation.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create invitation'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
