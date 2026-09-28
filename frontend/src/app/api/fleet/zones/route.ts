// src/app/api/fleet/zones/route.ts
//
// GET — proxies FastAPI's GET /stations/{id}/zones server-side, enforcing
// station scoping (departmentScope.ts) before the response reaches the
// browser — same shape as /api/fleet/graph and /api/fleet/summary.
// `?station=` selects which station's zone list to load; defaults to the
// caller's own station. Powers the 2D twin's zone-banded layout
// (lib/graph/zoneLayout.ts).

import { NextResponse } from 'next/server'
import { getCurrentMembership } from '@/lib/auth/rbac'
import { defaultStationId, isStationRequestAllowed } from '@/lib/graph/departmentScope'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://himadri.aus1in.me/api/v1'
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
    res = await fetch(`${API_BASE}/stations/${encodeURIComponent(station)}/zones`, {
      headers: { Authorization: `Bearer ${API_TOKEN}` },
      cache: 'no-store',
    })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }

  if (!res.ok) {
    return NextResponse.json({ error: `Backend ${res.status}` }, { status: res.status })
  }

  const zones = await res.json()
  return NextResponse.json(zones)
}
