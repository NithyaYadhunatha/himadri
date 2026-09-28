// src/app/api/nodes/[id]/blast-radius/route.ts
//
// GET — proxies FastAPI's GET /assets/{id}/blast-radius.
import { NextResponse } from 'next/server'
import { getCurrentMembership } from '@/lib/auth/rbac'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://himadri.aus1in.me/api/v1'
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN ?? ''

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const membership = await getCurrentMembership()
  if (!membership) {
    return NextResponse.json({ error: 'Membership not active' }, { status: 403 })
  }

  const { id } = await params

  let res: Response
  try {
    res = await fetch(`${API_BASE}/assets/${encodeURIComponent(id)}/blast-radius`, {
      headers: { Authorization: `Bearer ${API_TOKEN}` },
      cache: 'no-store',
    })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }

  if (!res.ok) {
    return NextResponse.json({ error: `Backend ${res.status}` }, { status: res.status })
  }

  return NextResponse.json(await res.json())
}
