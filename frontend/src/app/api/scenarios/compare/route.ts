// GET — proxies FastAPI's GET /scenarios/compare?ids=. Filters the returned
// scenarios down to ones the caller may see rather than rejecting the whole
// request, so a mixed selection (e.g. an HQ-shared comparison link) still
// shows the caller their own station's results.
import { NextResponse } from 'next/server'
import { backendFetch, requireMembership } from '@/lib/apiProxy'
import { canViewAllStations, isStationRequestAllowed } from '@/lib/graph/departmentScope'

type ScenarioDetail = { id: string; station_id: string }

export async function GET(req: Request) {
  const access = await requireMembership()
  if (!access.ok) return access.response

  const url = new URL(req.url)
  let res: Response
  try {
    res = await backendFetch(`/scenarios/compare${url.search}`)
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }
  if (!res.ok) {
    return NextResponse.json({ error: `Backend ${res.status}` }, { status: res.status })
  }

  const scenarios = (await res.json()) as ScenarioDetail[]
  if (canViewAllStations(access.membership)) return NextResponse.json(scenarios)
  return NextResponse.json(scenarios.filter((s) => isStationRequestAllowed(s.station_id, access.membership)))
}
