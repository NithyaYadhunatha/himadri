// src/app/api/nodes/[id]/maintenance/route.ts
//
// POST — proxies FastAPI's POST /assets/{id}/maintenance ("Log Maintenance
// Event" form on the QR Asset Passport page and the per-category panels).
import { NextResponse } from 'next/server'
import { getCurrentMembership } from '@/lib/auth/rbac'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://himadri.aus1in.me/api/v1'
const API_TOKEN = process.env.API_TOKEN ?? process.env.NEXT_PUBLIC_API_TOKEN ?? ''

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  const membership = await getCurrentMembership()
  if (!membership) {
    return NextResponse.json({ error: 'Membership not active' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))

  let res: Response
  try {
    res = await fetch(`${API_BASE}/assets/${encodeURIComponent(id)}/maintenance`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, logged_by: membership.name || membership.email }),
      cache: 'no-store',
    })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return NextResponse.json({ error: text || `Backend ${res.status}` }, { status: res.status })
  }

  return NextResponse.json(await res.json())
}
