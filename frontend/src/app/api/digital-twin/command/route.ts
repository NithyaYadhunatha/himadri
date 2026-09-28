import { NextResponse } from 'next/server'
import { backendFetch, requireMembership } from '@/lib/apiProxy'

const CONTROLLABLE_DEVICE = 'buzzer-01'

async function sendToLocalGateway(enabled: boolean): Promise<NextResponse | null> {
  // The local Mac gateway provides a safe development path while the deployed
  // HIMADRI backend is missing the command route. Production stays backend-only
  // unless an operator explicitly configures a gateway URL.
  const gatewayBase = process.env.POLARTWIN_GATEWAY_URL
    ?? (process.env.NODE_ENV === 'development' ? 'http://127.0.0.1:3001' : '')
  if (!gatewayBase) return null

  try {
    const response = await fetch(`${gatewayBase.replace(/\/$/, '')}/api/iot/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: enabled ? 'BUZZER:ON' : 'BUZZER:OFF' }),
      cache: 'no-store',
    })
    const text = await response.text()
    if (!response.ok) {
      let message = text || `Local gateway returned ${response.status}`
      try {
        const parsed = JSON.parse(text) as { error?: string }
        message = parsed.error || message
      } catch { /* retain the gateway response text */ }
      return NextResponse.json({ error: message, source: 'local-gateway' }, { status: response.status })
    }
    return NextResponse.json({ accepted: true, source: 'local-gateway', command: enabled ? 'BUZZER:ON' : 'BUZZER:OFF' })
  } catch {
    return NextResponse.json({ error: 'Local Arduino gateway is unreachable', source: 'local-gateway' }, { status: 502 })
  }
}

export async function POST(req: Request) {
  const access = await requireMembership()
  if (!access.ok) return access.response

  let body: { deviceId?: unknown; enabled?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (body.deviceId !== CONTROLLABLE_DEVICE || typeof body.enabled !== 'boolean') {
    return NextResponse.json(
      { error: 'Only an explicit boolean state for buzzer-01 is allowed' },
      { status: 400 },
    )
  }

  let response: Response
  try {
    response = await backendFetch(`/devices/${CONTROLLABLE_DEVICE}/command`, {
      method: 'POST',
      body: JSON.stringify({ command: 'SET_STATE', value: body.enabled }),
    })
  } catch {
    const localResponse = await sendToLocalGateway(body.enabled)
    return localResponse ?? NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }

  const text = await response.text()
  if (!response.ok) {
    if ([404, 405].includes(response.status)) {
      const localResponse = await sendToLocalGateway(body.enabled)
      if (localResponse) return localResponse
    }
    return NextResponse.json({ error: text || `Backend ${response.status}` }, { status: response.status })
  }
  return NextResponse.json(text ? JSON.parse(text) : { accepted: true }, { status: response.status })
}
