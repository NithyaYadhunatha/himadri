// src/app/api/nodes/[id]/alerts/route.ts
//
// GET — proxies FastAPI's GET /assets/{id}/alerts. `?active_only=true` maps
// onto the backend's state filter (open + acked, excluding resolved/
// suppressed) since the frontend's NodeInspector only ever wants "still
// relevant" alerts for an asset.
import { NextResponse } from 'next/server'
import { getCurrentMembership } from '@/lib/auth/rbac'
import type { BackendAlertDetail } from '@/lib/backendAdapters'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000'
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN ?? ''

type Params = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Params) {
  const membership = await getCurrentMembership()
  if (!membership) {
    return NextResponse.json({ error: 'Membership not active' }, { status: 403 })
  }

  const { id } = await params
  const { searchParams } = new URL(req.url)
  const activeOnly = searchParams.get('active_only') === 'true'

  let res: Response
  try {
    res = await fetch(`${API_BASE}/assets/${encodeURIComponent(id)}/alerts`, {
      headers: { Authorization: `Bearer ${API_TOKEN}` },
      cache: 'no-store',
    })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }

  if (!res.ok) {
    return NextResponse.json({ error: `Backend ${res.status}` }, { status: res.status })
  }

  const raw = (await res.json()) as BackendAlertDetail[]
  const filtered = activeOnly ? raw.filter((a) => a.state === 'open' || a.state === 'acked') : raw
  return NextResponse.json(filtered)
}
