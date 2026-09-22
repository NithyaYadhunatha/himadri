// GET  — proxies FastAPI's GET /reports (list all reports). The backend has
//        no `?station=` filter at all, so scoping is applied after the fetch
//        (like /api/audit): a station-locked caller sees their own
//        station's reports plus station_id=null fleet-wide ones.
// POST — proxies POST /reports (not currently exposed by the backend router
//        — /reports/generate is the real creation path — kept forwarding
//        defensively).
import { forwardStationScopedList, forwardToBackend, requireMembership } from '@/lib/apiProxy'

type ReportListItem = { id: string; station_id: string | null }

export async function GET(req: Request) {
  const access = await requireMembership()
  if (!access.ok) return access.response

  return forwardStationScopedList<ReportListItem>(req, '/reports', access.membership)
}

export async function POST(req: Request) {
  return forwardToBackend(req, '/reports')
}
