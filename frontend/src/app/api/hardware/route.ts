// GET — latest state of the physical twin (Arduino + Raspberry Pi gateway),
// proxied from the backend's digital-twin telemetry API. Read-only.
import { NextResponse } from 'next/server'
import { requireMembership } from '@/lib/apiProxy'

const ORIGIN = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://himadri.aus1in.me/api/v1').replace(/\/api\/v1\/?$/, '')

export async function GET() {
  const access = await requireMembership()
  if (!access.ok) return access.response
  try {
    const res = await fetch(`${ORIGIN}/api/telemetry/latest`, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ error: `Backend ${res.status}` }, { status: res.status })
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }
}
