// src/app/api/user/preferences/route.ts
//
// GET  — return this user's saved view preferences (or safe defaults when none exist yet).
// PUT  — upsert the preference fields supplied in the request body.
//
// Auth: any ACTIVE member may manage their own prefs.

import { type NextRequest, NextResponse } from 'next/server'
import { dbConnect } from '@/lib/mongodb'
import { getCurrentMembership } from '@/lib/auth/rbac'
import {
  UserPreferences,
  LAYOUT_PRESETS,
  NODE_SIZE_MODES,
  COLOR_MODES,
  type LayoutPreset,
  type NodeSizeMode,
  type ColorMode,
} from '@/lib/models/UserPreferences'

export async function GET() {
  const membership = await getCurrentMembership()
  if (!membership || membership.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await dbConnect()

  const prefs = await UserPreferences.findOne(
    { clerkUserId: membership.clerkUserId },
    { layoutPreset: 1, nodeSizeMode: 1, colorMode: 1, showEdgeLabels: 1, showLegend: 1 }
  ).lean()

  return NextResponse.json({
    layoutPreset: prefs?.layoutPreset ?? 'TB',
    nodeSizeMode: prefs?.nodeSizeMode ?? 'normal',
    colorMode: prefs?.colorMode ?? 'type',
    showEdgeLabels: prefs?.showEdgeLabels ?? false,
    showLegend: prefs?.showLegend ?? false,
  })
}

export async function PUT(req: NextRequest) {
  const membership = await getCurrentMembership()
  if (!membership || membership.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await dbConnect()

  const body = await req.json().catch(() => ({}))

  const update: Partial<{
    layoutPreset: LayoutPreset
    nodeSizeMode: NodeSizeMode
    colorMode: ColorMode
    showEdgeLabels: boolean
    showLegend: boolean
  }> = {}

  if (LAYOUT_PRESETS.includes(body.layoutPreset)) update.layoutPreset = body.layoutPreset as LayoutPreset
  if (NODE_SIZE_MODES.includes(body.nodeSizeMode)) update.nodeSizeMode = body.nodeSizeMode as NodeSizeMode
  if (COLOR_MODES.includes(body.colorMode)) update.colorMode = body.colorMode as ColorMode
  if (typeof body.showEdgeLabels === 'boolean') update.showEdgeLabels = body.showEdgeLabels
  if (typeof body.showLegend === 'boolean') update.showLegend = body.showLegend

  if (Object.keys(update).length > 0) {
    await UserPreferences.findOneAndUpdate(
      { clerkUserId: membership.clerkUserId },
      { $set: update },
      { upsert: true, new: true }
    )
  }

  return NextResponse.json({ ok: true })
}
