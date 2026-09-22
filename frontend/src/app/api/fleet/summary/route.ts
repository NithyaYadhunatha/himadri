// src/app/api/fleet/summary/route.ts
//
// GET — proxies FastAPI's GET /stations/{id}/summary server-side.
// `?station=` selects which station; defaults to the caller's own station.
//
// Auth: any ACTIVE member (getCurrentMembership + 403).

import { NextResponse } from 'next/server'
import { getCurrentMembership } from '@/lib/auth/rbac'
import { defaultStationId, isStationRequestAllowed } from '@/lib/graph/departmentScope'
import type { BackendTwinSummary } from '@/lib/backendAdapters'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000'
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN ?? ''

export async function GET(req: Request) {
  const membership = await getCurrentMembership()
  if (!membership) {
    return NextResponse.json({ error: 'Membership not active' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const station = searchParams.get('station') ?? defaultStationId(membership)

  if (!isStationRequestAllowed(station, membership)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE}/stations/${encodeURIComponent(station)}/summary`, {
      headers: { Authorization: `Bearer ${API_TOKEN}` },
      cache: 'no-store',
    })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }

  if (!res.ok) {
    return NextResponse.json({ error: `Backend ${res.status}` }, { status: res.status })
  }

  const summary = (await res.json()) as BackendTwinSummary
  return NextResponse.json(summary)
}
