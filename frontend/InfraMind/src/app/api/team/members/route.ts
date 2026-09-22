// src/app/api/team/members/route.ts
//
// Member list for the Phase 2 share-picker. Gated by requireActiveMembership
// (any ACTIVE member of the org — not admin-only, unlike /api/admin/members
// which powers the admin team-management UI) so a user picking share
// recipients for their Architecture can see who's on the org.
//
// Returns the User._id (not the Membership._id) since that's what
// Architecture.sharedWith[] references. Excludes the caller themselves —
// you can't share an architecture with yourself; the owner already sees it.

import { NextResponse } from 'next/server'
import { getCurrentMembership } from '@/lib/auth/rbac'
import { dbConnect } from '@/lib/mongodb'
import { Membership } from '@/lib/models/Membership'
import { User } from '@/lib/models/User'
import { escapeRegex } from '@/lib/search'

export async function GET(req: Request) {
  const membership = await getCurrentMembership()
  if (!membership) {
    return NextResponse.json({ error: 'Membership not active' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()

  await dbConnect()

  const membershipFilter: Record<string, unknown> = {
    status: 'ACTIVE',
    userId: { $ne: membership.userId },
  }

  if (q) {
    const pattern = new RegExp(escapeRegex(q), 'i')
    const matchingUsers = await User.find({ $or: [{ name: pattern }, { email: pattern }] })
      .select('_id')
      .lean()
    membershipFilter.userId = {
      $in: matchingUsers.map((u) => u._id),
      $ne: membership.userId,
    }
  }

  const active = await Membership.find(membershipFilter).sort({ activatedAt: -1 }).limit(200).lean()
  const userIds = active.map((m) => m.userId)
  const users = await User.find({ _id: { $in: userIds } }).lean()
  const userById = new Map(users.map((u) => [String(u._id), u]))

  const members = active.map((m) => ({
    userId: String(m.userId),
    email: userById.get(String(m.userId))?.email ?? '',
    name: userById.get(String(m.userId))?.name ?? '',
    department: m.department,
    role: m.role,
  }))

  return NextResponse.json({ members })
}
