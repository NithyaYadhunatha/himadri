// src/app/api/commands/route.ts
//
// GET  — proxies FastAPI's GET /commands?station=&state= (station-scoped
//        like /api/alerts).
// POST — proxies FastAPI's POST /commands (issue a control command, FR-9…14).
//        `issued_by`/`issued_role` are deliberately NOT taken from the
//        client body — a caller could otherwise issue a command "as" anyone.
//        They're derived from the caller's real membership instead, same
//        principle as forwardToBackend never trusting a client-supplied
//        identity for an audited action. The target asset is looked up
//        first (GET /assets/{id}, which — unlike the list endpoint — carries
//        `controllable`/`life_safety`) to station-scope the write: a caller
//        may only command an asset on a station they're allowed to write to.
import { NextResponse } from 'next/server'
import { backendFetch, forwardToBackendWithStation, requireMembership, resolveStationParam } from '@/lib/apiProxy'
import { isStationRequestAllowed } from '@/lib/graph/departmentScope'

interface BackendAssetDetailMin {
  id: string
  station_id: string
  controllable: boolean
}

export async function GET(req: Request) {
  const access = await requireMembership()
  if (!access.ok) return access.response

  const { searchParams } = new URL(req.url)
  const stationResult = resolveStationParam(searchParams, access.membership, { requireStation: true })
  if (!stationResult.ok) return stationResult.response

  return forwardToBackendWithStation(req, '/commands', stationResult.station)
}

export async function POST(req: Request) {
  const access = await requireMembership()
  if (!access.ok) return access.response

  const bodyText = await req.text()
  const body = (bodyText ? JSON.parse(bodyText) : null) as
    | { asset_id?: string; action?: string; payload?: Record<string, unknown>; issued_from?: string }
    | null

  if (!body?.asset_id || !body.action || !body.payload) {
    return NextResponse.json({ error: 'asset_id, action, and payload are required' }, { status: 400 })
  }
  if (!['setpoint', 'start', 'stop', 'mode'].includes(body.action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  let assetRes: Response
  try {
    assetRes = await backendFetch(`/assets/${encodeURIComponent(body.asset_id)}`)
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }
  if (!assetRes.ok) {
    return NextResponse.json({ error: assetRes.status === 404 ? 'Asset not found' : `Backend ${assetRes.status}` }, { status: assetRes.status })
  }
  const asset = (await assetRes.json()) as BackendAssetDetailMin
  if (!isStationRequestAllowed(asset.station_id, access.membership)) {
    return NextResponse.json({ error: 'Forbidden for this station' }, { status: 403 })
  }
  if (!asset.controllable) {
    return NextResponse.json({ error: 'Asset is not controllable' }, { status: 400 })
  }

  const forwardBody = JSON.stringify({
    asset_id: body.asset_id,
    action: body.action,
    payload: body.payload,
    issued_by: access.membership.name || access.membership.email,
    issued_role: access.membership.role,
    issued_from: body.issued_from === 'hq' ? 'hq' : 'station',
  })

  let res: Response
  try {
    res = await backendFetch('/commands', { method: 'POST', body: forwardBody })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }
  const text = await res.text()
  if (!res.ok) {
    return NextResponse.json({ error: text || `Backend ${res.status}` }, { status: res.status })
  }
  return NextResponse.json(text ? JSON.parse(text) : {}, { status: res.status })
}
