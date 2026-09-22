// src/app/api/admin/invitations/[id]/route.ts
import { NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { requireRole } from '@/lib/auth/rbac'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireRole(['STATION_LEADER', 'HQ_OPERATOR'])
  if (!check.ok) return check.response

  const { id } = await params
  const clerk = await clerkClient()

  try {
    await clerk.invitations.revokeInvitation(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to revoke invitation'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
