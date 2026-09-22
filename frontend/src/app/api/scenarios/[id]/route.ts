// GET — proxies FastAPI's GET /scenarios/{id}. 404s both when the backend
// doesn't know the scenario and when it belongs to a station the caller
// can't see (same "don't leak existence" shape as /api/nodes/[id]).
import { NextResponse } from 'next/server'
import { backendFetch, requireMembership } from '@/lib/apiProxy'
import { isStationRequestAllowed } from '@/lib/graph/departmentScope'

type ScenarioDetail = { id: string; station_id: string }
type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const access = await requireMembership()
  if (!access.ok) return access.response

  const { id } = await params

  let res: Response
  try {
    res = await backendFetch(`/scenarios/${encodeURIComponent(id)}`)
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }
  if (!res.ok) {
    return NextResponse.json({ error: `Backend ${res.status}` }, { status: res.status })
  }

  const scenario = (await res.json()) as ScenarioDetail
  if (!isStationRequestAllowed(scenario.station_id, access.membership)) {
    return NextResponse.json({ error: 'Scenario not found' }, { status: 404 })
  }

  return NextResponse.json(scenario)
}
