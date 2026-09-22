// src/app/api/commands/[id]/route.ts
//
// GET — proxies FastAPI's GET /commands/{id}. 404s (not 403) when the
// command exists but belongs to a station the caller can't see — same
// "don't leak existence" shape as /api/nodes/[id].
import { NextResponse } from 'next/server'
import { backendFetch, requireMembership } from '@/lib/apiProxy'
import { isStationRequestAllowed } from '@/lib/graph/departmentScope'

type Params = { params: Promise<{ id: string }> }

interface BackendCommandMin { station_id: string }

export async function GET(_req: Request, { params }: Params) {
  const access = await requireMembership()
  if (!access.ok) return access.response

  const { id } = await params

  let res: Response
  try {
    res = await backendFetch(`/commands/${encodeURIComponent(id)}`)
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }
  if (!res.ok) {
    return NextResponse.json({ error: `Backend ${res.status}` }, { status: res.status })
  }
  const command = (await res.json()) as BackendCommandMin
  if (!isStationRequestAllowed(command.station_id, access.membership)) {
    return NextResponse.json({ error: 'Command not found' }, { status: 404 })
  }
  return NextResponse.json(command)
}
