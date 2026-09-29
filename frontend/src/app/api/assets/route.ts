// src/app/api/assets/route.ts
//
// POST — proxies FastAPI's POST /assets (create a new asset). Used by
// ConnectNodeModal/CreateCustomNodeModal's "register a new asset" flow.
// GET — proxies FastAPI's GET /assets unscoped (same backend data as
// /api/nodes, kept as a second path since the new asset-creation UI reads
// more naturally as /api/assets than /api/nodes when read alongside its
// sibling POST).
import { NextResponse } from 'next/server'
import { getCurrentMembership } from '@/lib/auth/rbac'
import { isStationRequestAllowed } from '@/lib/graph/departmentScope'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://himadri.aus1in.me/api/v1'
const API_TOKEN = process.env.API_TOKEN ?? process.env.NEXT_PUBLIC_API_TOKEN ?? ''

export async function POST(req: Request) {
  const membership = await getCurrentMembership()
  if (!membership) {
    return NextResponse.json({ error: 'Membership not active' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as { station_id?: string } | null
  if (!body?.station_id || !isStationRequestAllowed(body.station_id, membership)) {
    return NextResponse.json({ error: 'Forbidden for this station' }, { status: 403 })
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE}/assets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }

  const text = await res.text()
  if (!res.ok) {
    return NextResponse.json({ error: text || `Backend ${res.status}` }, { status: res.status })
  }
  return NextResponse.json(text ? JSON.parse(text) : {})
}
