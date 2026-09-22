// src/app/api/admin/invitations/route.ts
//
// Lists outstanding ("awaiting signup") Clerk invitations for the admin
// panel's third table. Supports ?q= for the search box — Clerk's own
// invitations API takes a query param and searches by email server-side.
import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/rbac'
import { DEV_BYPASS_AUTH } from '@/lib/auth/devBypass'

export async function GET(req: Request) {
  const check = await requireRole(['STATION_LEADER', 'HQ_OPERATOR'])
  if (!check.ok) return check.response

  // Local-dev-only: no Clerk keys configured under DEV_BYPASS_AUTH — there's
  // no real Clerk org to list pending invitations for. See devBypass.ts.
  if (DEV_BYPASS_AUTH) return NextResponse.json({ invitations: [] })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() || undefined

  const { clerkClient } = await import('@clerk/nextjs/server')
  const clerk = await clerkClient()
  const { data } = await clerk.invitations.getInvitationList({
    status: 'pending',
    query: q,
    limit: 100,
  })

  const invitations = data.map((inv) => ({
    id: inv.id,
    email: inv.emailAddress,
    department: (inv.publicMetadata as Record<string, unknown> | null)?.invitedDepartment ?? null,
    role: (inv.publicMetadata as Record<string, unknown> | null)?.invitedRole ?? null,
    createdAt: inv.createdAt,
  }))

  return NextResponse.json({ invitations })
}
