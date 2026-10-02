// ONE shared realtime service for the whole console (no per-component timers).
// Preference order, per the existing project: WebSocket /ws/digital-twin (the
// stream the Unity build already uses) → poll /api/hardware (auth-gated proxy
// of GET /api/telemetry/latest). Demo mode swaps in a local generator.
import { adaptFrame, adaptSnapshot } from './adapter'
import { FRESHNESS } from './config'
import { demoFrame } from './demo'
import { useTwin } from './store'

let started = 0
let ws: WebSocket | null = null
let wsAt = 0
let wsAttempt = 0
let timers: ReturnType<typeof setTimeout>[] = []
let pollT: ReturnType<typeof setInterval> | null = null
let health: ReturnType<typeof setInterval> | null = null
let backendOk = false

function wsUrl(): string | null {
  const api = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://himadri.aus1in.me/api/v1'
  try {
    const u = new URL(api)
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
    u.pathname = '/ws/digital-twin'
    return u.toString()
  } catch { return null }
}

async function poll() {
  if (useTwin.getState().mode !== 'live') return
  // Skip polling while the socket is delivering.
  if (ws?.readyState === WebSocket.OPEN && Date.now() - wsAt < FRESHNESS.wsSilentMs) return
  try {
    const ctl = new AbortController()
    const to = setTimeout(() => ctl.abort(), 6000)
    const res = await fetch('/api/hardware', { cache: 'no-store', signal: ctl.signal })
    clearTimeout(to)
    if (!res.ok) throw new Error(String(res.status))
    backendOk = true
    useTwin.getState().ingest(adaptSnapshot(await res.json()), false)
  } catch {
    backendOk = false
  }
}

function openSocket() {
  const url = wsUrl()
  if (!url || typeof WebSocket === 'undefined') return
  try { ws = new WebSocket(url) } catch { return }
  ws.onopen = () => { wsAttempt = 0 }
  ws.onmessage = (ev) => {
    wsAt = Date.now()
    backendOk = true
    try { useTwin.getState().ingest(adaptFrame(JSON.parse(String(ev.data))), false) } catch { /* invalid payload: drop */ }
  }
  ws.onclose = () => {
    ws = null
    if (!started) return
    timers.push(setTimeout(openSocket, Math.min(1000 * 2 ** ++wsAttempt, 30_000)))
  }
  ws.onerror = () => ws?.close()
}

function evaluateLink() {
  const s = useTwin.getState()
  if (s.mode === 'demo') {
    s.ingest(demoFrame(Date.now()), true)
    s.setLink('live')
    return
  }
  const vals = Object.values(s.latest)
  const now = Date.now()
  const reachable = backendOk || (ws?.readyState === WebSocket.OPEN)
  if (!reachable && !vals.length) s.setLink(started && now - started < 8000 ? 'connecting' : 'backend-offline')
  else if (!reachable) s.setLink('backend-offline')
  else if (!vals.length || vals.every((r) => r.status === 'offline')) s.setLink('gateway-offline')
  else if (now - Math.max(...vals.filter((r) => r.status !== 'offline').map((r) => r.receivedAt)) > FRESHNESS.staleMs) s.setLink('stale')
  else s.setLink('live')
}

export function startRealtime() {
  if (started) return
  started = Date.now()
  openSocket()
  void poll()
  pollT = setInterval(poll, FRESHNESS.pollMs)
  health = setInterval(evaluateLink, 1000)
}

export function stopRealtime() {
  started = 0
  timers.forEach(clearTimeout); timers = []
  if (pollT) clearInterval(pollT)
  if (health) clearInterval(health)
  pollT = health = null
  const w = ws; ws = null; w?.close()
}
