// Command service. Uses only the existing, RBAC-gated route
// POST /api/digital-twin/command, which accepts buzzer-01 SET_STATE only.
import type { CommandState } from './types'

export async function sendToggle(deviceId: string, enabled: boolean): Promise<{ state: CommandState; message: string }> {
  const ctl = new AbortController()
  const to = setTimeout(() => ctl.abort(), 10_000)
  try {
    const res = await fetch('/api/digital-twin/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, enabled }),
      signal: ctl.signal,
    })
    const body = (await res.json().catch(() => ({}))) as { error?: string; source?: string }
    if (!res.ok) return { state: 'failed', message: body.error || `Request failed (${res.status})` }
    return { state: 'accepted', message: body.source === 'local-gateway' ? 'Accepted by local gateway' : 'Accepted by backend' }
  } catch (e) {
    return e instanceof DOMException && e.name === 'AbortError'
      ? { state: 'timeout', message: 'No response within 10 s' }
      : { state: 'failed', message: 'Could not reach the command API' }
  } finally {
    clearTimeout(to)
  }
}
