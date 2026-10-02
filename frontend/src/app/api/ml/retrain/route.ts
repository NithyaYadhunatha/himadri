// POST — kicks off a predictive-maintenance retrain on the backend. Only roles
// that can manage the team (station leader / HQ operator) may trigger it.
import { NextResponse } from 'next/server'
import { forwardToBackend, requireMembership } from '@/lib/apiProxy'
import { hasPermission } from '@/lib/auth/permissions'

export async function POST(req: Request) {
  const access = await requireMembership()
  if (!access.ok) return access.response
  if (!hasPermission(access.membership.role, 'manageTeam')) {
    return NextResponse.json({ error: 'Not permitted to retrain models' }, { status: 403 })
  }
  return forwardToBackend(req, '/model-accuracy/retrain')
}
