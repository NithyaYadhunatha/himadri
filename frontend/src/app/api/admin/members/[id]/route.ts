// src/app/api/admin/members/[id]/route.ts
import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/rbac'
import { dbConnect } from '@/lib/mongodb'
import { Membership, DEPARTMENTS, ROLES } from '@/lib/models/Membership'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireRole(['STATION_LEADER', 'HQ_OPERATOR'])
  if (!check.ok) return check.response

  const { id } = await params
  const body = await req.json().catch(() => null)
  const { department, role } = body ?? {}

  if (department !== undefined && !DEPARTMENTS.includes(department)) {
    return NextResponse.json({ error: 'Invalid department' }, { status: 400 })
  }
  if (role !== undefined && !ROLES.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  await dbConnect()

  const membership = await Membership.findById(id)
  if (!membership) {
    return NextResponse.json({ error: 'Membership not found' }, { status: 404 })
  }

  if (department !== undefined) membership.department = department
  if (role !== undefined) membership.role = role
  await membership.save()

  return NextResponse.json({ ok: true, membershipId: String(membership._id) })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireRole(['STATION_LEADER', 'HQ_OPERATOR'])
  if (!check.ok) return check.response

  const { id } = await params
  await dbConnect()

  const membership = await Membership.findById(id)
  if (!membership) {
    return NextResponse.json({ error: 'Membership not found' }, { status: 404 })
  }

  membership.status = 'REVOKED'
  await membership.save()

  return NextResponse.json({ ok: true, membershipId: String(membership._id) })
}
