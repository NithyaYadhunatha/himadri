// src/app/api/admin/invite/route.ts
//
// Approves a PENDING membership: assigns department + role and flips it ACTIVE.
import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/rbac'
import { dbConnect } from '@/lib/mongodb'
import { Membership, DEPARTMENTS, ROLES } from '@/lib/models/Membership'

export async function POST(req: Request) {
  const check = await requireRole(['STATION_LEADER', 'HQ_OPERATOR'])
  if (!check.ok) return check.response

  const body = await req.json().catch(() => null)
  const { membershipId, department, role } = body ?? {}

  if (!membershipId || typeof membershipId !== 'string') {
    return NextResponse.json({ error: 'membershipId is required' }, { status: 400 })
  }
  if (!DEPARTMENTS.includes(department)) {
    return NextResponse.json({ error: 'Invalid department' }, { status: 400 })
  }
  if (!ROLES.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  await dbConnect()

  const membership = await Membership.findById(membershipId)
  if (!membership) {
    return NextResponse.json({ error: 'Membership not found' }, { status: 404 })
  }

  membership.department = department
  membership.role = role
  membership.status = 'ACTIVE'
  membership.invitedBy = check.membership.userId as unknown as typeof membership.invitedBy
  membership.invitedAt = new Date()
  membership.activatedAt = new Date()
  await membership.save()

  return NextResponse.json({ ok: true, membershipId: String(membership._id) })
}
