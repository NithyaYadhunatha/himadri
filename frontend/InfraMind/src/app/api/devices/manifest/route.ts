// POST — proxies FastAPI's POST /devices/manifest (DeviceManifest
// registration). The body has no station_id itself — it targets an existing
// asset_id — so ownership is checked by looking that asset up first (same
// pattern as /api/nodes/[id]).
import { NextResponse } from 'next/server'
import { backendFetch, forwardToBackend, requireMembership } from '@/lib/apiProxy'
import { isStationRequestAllowed } from '@/lib/graph/departmentScope'
import type { BackendAssetListItem } from '@/lib/backendAdapters'

export async function POST(req: Request) {
  const access = await requireMembership()
  if (!access.ok) return access.response

  const bodyText = await req.text()
  const body = (bodyText ? JSON.parse(bodyText) : null) as { asset_id?: string } | null
  if (!body?.asset_id) {
    return NextResponse.json({ error: 'asset_id required' }, { status: 400 })
  }

  const res = await backendFetch(`/assets/${encodeURIComponent(body.asset_id)}`).catch(() => null)
  if (res?.ok) {
    const asset = (await res.json()) as BackendAssetListItem
    if (!isStationRequestAllowed(asset.station_id, access.membership)) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    }
  }

  return forwardToBackend(new Request(req.url, { method: 'POST', headers: req.headers, body: bodyText }), '/devices/manifest', { method: 'POST' })
}
