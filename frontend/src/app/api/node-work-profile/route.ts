// src/app/api/node-work-profile/route.ts
//
// GET  ?nodeKey=X  — return the stored work profile for a node, or null when
//                    no profile has been saved (caller uses type defaults).
// PUT              — upsert a work profile. Admin-only; any active member may read.

import { type NextRequest, NextResponse } from 'next/server'
import { dbConnect } from '@/lib/mongodb'
import { getCurrentMembership } from '@/lib/auth/rbac'
import { NodeWorkProfile, NODE_ACTION_CATEGORIES } from '@/lib/models/NodeWorkProfile'
import type { NodeActionCategory } from '@/lib/nodeWorkProfile/constants'

export async function GET(req: NextRequest) {
  const membership = await getCurrentMembership()
  const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === 'true'
  if (!USE_MOCK) {
    if (!membership || membership.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const nodeKey = req.nextUrl.searchParams.get('nodeKey')
  if (!nodeKey) {
    return NextResponse.json({ error: 'nodeKey is required' }, { status: 400 })
  }

  await dbConnect()

  const profile = await NodeWorkProfile.findOne(
    { nodeKey },
    { nodeKey: 1, enabledActionIds: 1, customActions: 1 },
  ).lean()

  return NextResponse.json({ profile: profile ?? null })
}

export async function PUT(req: NextRequest) {
  const membership = await getCurrentMembership()
  const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === 'true'
  if (!USE_MOCK) {
    if (!membership || membership.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (membership.role !== 'STATION_LEADER' && membership.role !== 'HQ_OPERATOR') {
      return NextResponse.json({ error: 'Station Leader or HQ Operator role required' }, { status: 403 })
    }
  }

  await dbConnect()

  const body = await req.json().catch(() => ({}))

  const { nodeKey, enabledActionIds, customActions } = body

  if (!nodeKey || typeof nodeKey !== 'string') {
    return NextResponse.json({ error: 'nodeKey is required' }, { status: 400 })
  }

  const safeEnabledIds: string[] = Array.isArray(enabledActionIds)
    ? enabledActionIds.filter((id): id is string => typeof id === 'string')
    : []

  type CustomActionInput = {
    id?: unknown
    label?: unknown
    description?: unknown
    category?: unknown
    requiresConfirmation?: unknown
  }
  const safeCustomActions = Array.isArray(customActions)
    ? (customActions as CustomActionInput[])
        .filter(
          (c) =>
            typeof c.id === 'string' &&
            typeof c.label === 'string' &&
            NODE_ACTION_CATEGORIES.includes(c.category as NodeActionCategory),
        )
        .map((c) => ({
          id: c.id as string,
          label: c.label as string,
          description: typeof c.description === 'string' ? c.description : '',
          category: c.category as NodeActionCategory,
          requiresConfirmation: typeof c.requiresConfirmation === 'boolean' ? c.requiresConfirmation : false,
        }))
    : []

  const profile = await NodeWorkProfile.findOneAndUpdate(
    { nodeKey },
    { $set: { enabledActionIds: safeEnabledIds, customActions: safeCustomActions } },
    { upsert: true, new: true },
  ).lean()

  return NextResponse.json({ profile })
}
