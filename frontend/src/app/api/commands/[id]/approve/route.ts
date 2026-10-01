// src/app/api/commands/[id]/approve/route.ts
//
// POST — proxies FastAPI's POST /commands/{id}/approve. Unlike POST
// /commands (where issued_by/issued_role come from the caller's own
// membership), `approver`/`approver_role` here ARE taken from the request
// body: FR-11's second-approver is, by definition, a *different* authorised
// person than whoever is currently logged in issuing the request, and this
// single-mock-user dev environment has no second real session to approve
// as — the Remote Control page's UI instead requires the approver name
// typed in to differ from the command's issued_by before enabling the
// button, and the backend (command_engine.approve_command) is the real
// enforcement point: it 400s if approver === issued_by regardless of what
// the UI allowed.
import { NextResponse } from 'next/server'
import { backendFetch, forwardToBackend, requireMembership } from '@/lib/apiProxy'
import { isStationRequestAllowed } from '@/lib/graph/departmentScope'
import { DEV_BYPASS_AUTH } from '@/lib/auth/devBypass'
import { hasPermission } from '@/lib/auth/permissions'

type Params = { params: Promise<{ id: string }> }

interface BackendCommandMin { station_id: string; issued_by: string }

const norm = (s: string) => s.trim().split(/\s+/).join(' ').toLowerCase()
const same = (a: string, b: string) => norm(a) === norm(b)

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

  // Outside local dev there is exactly one trustworthy identity: the signed-in
  // session. The approver name/role in the request body are ignored, so one
  // person cannot approve their own command by typing another name, and only
  // roles allowed to co-approve life-safety actions may do so.
  if (!DEV_BYPASS_AUTH) {
    const m = access.membership
    if (!hasPermission(m.role, 'approveLifeSafetyCommand')) {
      return NextResponse.json({ error: 'Your role may not approve life-safety commands' }, { status: 403 })
    }
    const approver = m.name || m.email
    if (same(approver, command.issued_by) || same(m.email, command.issued_by)) {
      return NextResponse.json({ error: 'A second, different authorised user must approve this command' }, { status: 400 })
    }
    const res = await backendFetch(`/commands/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      body: JSON.stringify({ approver, approver_role: m.role }),
    })
    const text = await res.text()
    return new NextResponse(text, { status: res.status, headers: { 'Content-Type': 'application/json' } })
  }
  return forwardToBackend(req, `/commands/${encodeURIComponent(id)}/approve`, { method: 'POST' })
}
