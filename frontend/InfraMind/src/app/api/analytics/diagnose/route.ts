// POST — proxies FastAPI's POST /analytics/diagnose (guided fault
// diagnosis). Most calls are generic (category/subtype only — no station
// concept). When the caller points diagnosis at a specific asset_id or
// alert_id, that resource's station is checked first so a station-locked
// caller can't probe another station's asset/alert telemetry through this
// endpoint.
import { NextResponse } from 'next/server'
import { backendFetch, forwardToBackend, requireMembership } from '@/lib/apiProxy'
import { isStationRequestAllowed } from '@/lib/graph/departmentScope'
import type { BackendAlertDetail, BackendAssetListItem } from '@/lib/backendAdapters'

export async function POST(req: Request) {
  const access = await requireMembership()
  if (!access.ok) return access.response

  const bodyText = await req.text()
  const body = (bodyText ? JSON.parse(bodyText) : null) as { asset_id?: string; alert_id?: string } | null

  if (body?.asset_id) {
    const res = await backendFetch(`/assets/${encodeURIComponent(body.asset_id)}`).catch(() => null)
    if (res?.ok) {
      const asset = (await res.json()) as BackendAssetListItem
      if (!isStationRequestAllowed(asset.station_id, access.membership)) {
        return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
      }
    }
  } else if (body?.alert_id) {
    const res = await backendFetch('/alerts').catch(() => null)
    if (res?.ok) {
      const alerts = (await res.json()) as BackendAlertDetail[]
      const alert = alerts.find((a) => a.id === body.alert_id)
      if (alert && !isStationRequestAllowed(alert.station_id, access.membership)) {
        return NextResponse.json({ error: 'Alert not found' }, { status: 404 })
      }
    }
  }

  return forwardToBackend(new Request(req.url, { method: 'POST', headers: req.headers, body: bodyText }), '/analytics/diagnose', { method: 'POST' })
}
