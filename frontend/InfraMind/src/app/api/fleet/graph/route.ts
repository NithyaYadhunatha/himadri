// src/app/api/fleet/graph/route.ts
//
// GET — proxies FastAPI's GET /stations/{id}/twin-graph server-side,
// enforcing station scoping (departmentScope.ts) before the response
// reaches the browser. Kept at the /api/fleet/graph path (rather than
// renamed to /api/twin/graph) to avoid touching graph.service.ts's existing
// caller — see /api/nodes/route.ts's header comment for the same reasoning.
// `?station=` selects which station's twin graph to load; defaults to the
// caller's own station.
//
// Auth: any ACTIVE member (getCurrentMembership + 403).

import { NextResponse } from 'next/server'
import { getCurrentMembership } from '@/lib/auth/rbac'
import { defaultStationId, isStationRequestAllowed } from '@/lib/graph/departmentScope'
import type { BackendFullGraph } from '@/lib/backendAdapters'

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
    res = await fetch(`${API_BASE}/stations/${encodeURIComponent(station)}/twin-graph`, {
      headers: { Authorization: `Bearer ${API_TOKEN}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    })
  } catch {
    return NextResponse.json({ error: 'Infrastructure backend unavailable or timed out' }, { status: 504 })
  }

  if (!res.ok) {
    return NextResponse.json({ error: `Backend ${res.status}` }, { status: res.status })
  }

  const raw = (await res.json()) as BackendFullGraph
  return NextResponse.json(raw)
}
