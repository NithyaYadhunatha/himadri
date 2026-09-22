// GET  — proxies FastAPI's GET /alert-rules?station=&asset=, station-scoped
//        like /api/advisories.
// POST/PATCH — proxy POST/PATCH /alert-rules. `station_id` is nullable on
//        the backend (null = fleet-wide rule); only an HQ/Admin/Auditor
//        caller may create or edit a fleet-wide rule, or one for a station
//        that isn't their own.
import { forwardToBackend, forwardToBackendWithStation, requireAllowedStationOrFleetWide, requireMembership, resolveStationParam } from '@/lib/apiProxy'

export async function GET(req: Request) {
  const access = await requireMembership()
  if (!access.ok) return access.response

  const { searchParams } = new URL(req.url)
  const stationResult = resolveStationParam(searchParams, access.membership)
  if (!stationResult.ok) return stationResult.response

  return forwardToBackendWithStation(req, '/alert-rules', stationResult.station)
}

async function writeWithStationCheck(req: Request, method: 'POST' | 'PATCH') {
  const access = await requireMembership()
  if (!access.ok) return access.response

  const bodyText = await req.text()
  const body = (bodyText ? JSON.parse(bodyText) : null) as { station_id?: string | null } | null
  const forbidden = requireAllowedStationOrFleetWide(body?.station_id, access.membership)
  if (forbidden) return forbidden

  return forwardToBackend(new Request(req.url, { method, headers: req.headers, body: bodyText }), '/alert-rules', { method })
}

export async function POST(req: Request) {
  return writeWithStationCheck(req, 'POST')
}

export async function PATCH(req: Request) {
  return writeWithStationCheck(req, 'PATCH')
}
