// src/app/api/nodes/[id]/route.ts
//
// GET — proxies FastAPI's GET /assets/{id}. Returns 404 both when the
// backend doesn't know the asset and when it exists but is station-scoped
// away from the caller — the same response either way so a scoped-out
// asset's existence isn't leaked.
//
// Auth: any ACTIVE member (getCurrentMembership + 403).

import { NextResponse } from 'next/server'
import { getCurrentMembership, requireRole } from '@/lib/auth/rbac'
import { isStationRequestAllowed } from '@/lib/graph/departmentScope'
import type { BackendAssetListItem } from '@/lib/backendAdapters'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://himadri.aus1in.me/api/v1'
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN ?? ''

type Params = { params: Promise<{ id: string }> }

async function backendGetAsset(id: string): Promise<Response> {
  return fetch(`${API_BASE}/assets/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${API_TOKEN}` },
    cache: 'no-store',
  })
}

export async function GET(_req: Request, { params }: Params) {
  const membership = await getCurrentMembership()
  if (!membership) {
    return NextResponse.json({ error: 'Membership not active' }, { status: 403 })
  }

  const { id } = await params

  let res: Response
  try {
    res = await backendGetAsset(id)
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }

  if (!res.ok) {
    return NextResponse.json({ error: `Backend ${res.status}` }, { status: res.status })
  }

  const asset = (await res.json()) as BackendAssetListItem
  if (!isStationRequestAllowed(asset.station_id, membership)) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
  }

  return NextResponse.json(asset)
}

export async function DELETE(_req: Request, { params }: Params) {
  const access = await requireRole(['STATION_LEADER', 'HQ_OPERATOR'])
  if (!access.ok) return access.response

  const { id } = await params

  let getRes: Response
  try {
    getRes = await backendGetAsset(id)
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }
  if (getRes.ok) {
    const asset = (await getRes.json()) as BackendAssetListItem
    if (!isStationRequestAllowed(asset.station_id, access.membership)) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    }
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE}/assets/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${API_TOKEN}` },
      cache: 'no-store',
    })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }

  if (!res.ok) {
    return NextResponse.json({ error: `Backend ${res.status}` }, { status: res.status })
  }

  return new NextResponse(null, { status: 204 })
}
