// src/app/api/commands/[id]/cancel/route.ts
//
// POST — proxies FastAPI's POST /commands/{id}/cancel. Ownership check via
// GET /commands/{id} first, same pattern as approve/route.ts.
import { NextResponse } from 'next/server'
import { backendFetch, forwardToBackend, requireMembership } from '@/lib/apiProxy'
import { isStationRequestAllowed } from '@/lib/graph/departmentScope'

type Params = { params: Promise<{ id: string }> }

interface BackendCommandMin { station_id: string }

export async function POST(req: Request, { params }: Params) {
  const access = await requireMembership()
  if (!access.ok) return access.response

  const { id } = await params

  let cmdRes: Response
  try {
    cmdRes = await backendFetch(`/commands/${encodeURIComponent(id)}`)
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }
  if (!cmdRes.ok) {
    return NextResponse.json({ error: `Backend ${cmdRes.status}` }, { status: cmdRes.status })
  }
  const command = (await cmdRes.json()) as BackendCommandMin
  if (!isStationRequestAllowed(command.station_id, access.membership)) {
    return NextResponse.json({ error: 'Command not found' }, { status: 404 })
  }

  return forwardToBackend(req, `/commands/${encodeURIComponent(id)}/cancel`, { method: 'POST' })
}
