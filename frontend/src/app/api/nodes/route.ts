// src/app/api/nodes/route.ts
//
// GET — proxies FastAPI's GET /assets server-side, filtered to the caller's
// own station unless their role/department grants cross-station visibility
// (see lib/graph/departmentScope.ts). Kept at the /api/nodes path (rather
// than renamed to /api/assets) so the many existing client callers written
// against "node" terminology (nodeHealth.service.ts, NodeInspector, ...)
// didn't all need touching for a HIMADRI rebrand that's cosmetic at this
// layer — the frontend keeps its generic "graph node" vocabulary while the
// backend concept underneath is now an Asset.
//
// Auth: any ACTIVE member (getCurrentMembership + 403).

import { NextResponse } from 'next/server'
import { getCurrentMembership } from '@/lib/auth/rbac'
import { scopeByStation } from '@/lib/graph/departmentScope'
import type { BackendAssetListItem } from '@/lib/backendAdapters'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://himadri.aus1in.me/api/v1'
const API_TOKEN = process.env.API_TOKEN ?? process.env.NEXT_PUBLIC_API_TOKEN ?? ''

export async function GET() {
  const membership = await getCurrentMembership()
  if (!membership) {
    return NextResponse.json({ error: 'Membership not active' }, { status: 403 })
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE}/assets`, {
      headers: { Authorization: `Bearer ${API_TOKEN}` },
      cache: 'no-store',
    })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }

  if (!res.ok) {
    return NextResponse.json({ error: `Backend ${res.status}` }, { status: res.status })
  }

  const raw = (await res.json()) as BackendAssetListItem[]
  return NextResponse.json(scopeByStation(raw, membership))
}
