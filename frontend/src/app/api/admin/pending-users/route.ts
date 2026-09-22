// src/app/api/admin/pending-users/route.ts
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

  const membershipFilter: Record<string, unknown> = { status: 'PENDING' }

  // Search by name/email: resolve matching Users first (indexed), then
  // restrict the Membership query to their ids — cheaper than loading every
  // pending membership and filtering in application code as the user count grows.
  if (q) {
    const pattern = new RegExp(escapeRegex(q), 'i')
    const matchingUsers = await User.find({ $or: [{ name: pattern }, { email: pattern }] })
      .select('_id')
      .lean()
    membershipFilter.userId = { $in: matchingUsers.map((u) => u._id) }
  }

  const pending = await Membership.find(membershipFilter).sort({ _id: -1 }).limit(200).lean()
  const userIds = pending.map((m) => m.userId)
  const users = await User.find({ _id: { $in: userIds } }).lean()
  const userById = new Map(users.map((u) => [String(u._id), u]))

  const result = pending.map((m) => ({
    membershipId: String(m._id),
    clerkUserId: m.clerkUserId,
    email: userById.get(String(m.userId))?.email ?? '',
    name: userById.get(String(m.userId))?.name ?? '',
    createdAt: userById.get(String(m.userId))?.createdAt ?? null,
  }))

  return NextResponse.json({ pending: result })
}
