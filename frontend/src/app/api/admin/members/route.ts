// src/app/api/admin/members/route.ts
import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/rbac'
import { dbConnect } from '@/lib/mongodb'
import { Membership } from '@/lib/models/Membership'
import { User } from '@/lib/models/User'
import { escapeRegex } from '@/lib/search'

export async function GET(req: Request) {
  const check = await requireRole(['STATION_LEADER', 'HQ_OPERATOR'])
  if (!check.ok) return check.response

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()

  await dbConnect()

  const membershipFilter: Record<string, unknown> = { status: 'ACTIVE' }

  if (q) {
    const pattern = new RegExp(escapeRegex(q), 'i')
    const matchingUsers = await User.find({ $or: [{ name: pattern }, { email: pattern }] })
      .select('_id')
      .lean()
    membershipFilter.userId = { $in: matchingUsers.map((u) => u._id) }
  }

  const active = await Membership.find(membershipFilter).sort({ activatedAt: -1 }).limit(200).lean()
  const userIds = active.map((m) => m.userId)
  const users = await User.find({ _id: { $in: userIds } }).lean()
  const userById = new Map(users.map((u) => [String(u._id), u]))

  const result = active.map((m) => ({
    membershipId: String(m._id),
    clerkUserId: m.clerkUserId,
    email: userById.get(String(m.userId))?.email ?? '',
    name: userById.get(String(m.userId))?.name ?? '',
    department: m.department,
    role: m.role,
    activatedAt: m.activatedAt,
  }))

  return NextResponse.json({ members: result })
}
