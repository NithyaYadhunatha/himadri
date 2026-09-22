// GET — proxies FastAPI's GET /audit?from=&to=&user= (privileged-action
// log). The backend has no `?station=` filter at all, so scoping is applied
// here after the fetch: a station-locked Station Leader sees only their own
// station's audit trail (plus station_id=null fleet-wide events); an
// HQ Operator/Auditor/Admin sees everything, matching the RBAC matrix
// ("Auditor sees everything, a station-locked Leader sees their own
// station's log").
import { forwardStationScopedList, requireMembership } from '@/lib/apiProxy'

type AuditEventDetail = { seq: number; station_id: string | null }

export async function GET(req: Request) {
  const access = await requireMembership()
  if (!access.ok) return access.response

  return forwardStationScopedList<AuditEventDetail>(req, '/audit', access.membership)
}
