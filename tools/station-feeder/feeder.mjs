#!/usr/bin/env node
// HIMADRI station feeder — a stand-in for the station's device agents.
//
// Posts physically plausible heartbeats for every asset in both stations to the
// HIMADRI backend's real /agent/heartbeat pipeline (reading -> alert rules ->
// risk -> graph -> WebSocket), exactly like the PySide device agent in
// backend/agent does. Readings are tagged source="simulated" by the backend.
//
//   node feeder.mjs                    # steady-state, one heartbeat/asset/60s
//   node feeder.mjs --fast             # demo cadence, one heartbeat/asset/8s
//   node feeder.mjs --backfill         # also write 24h of history for key series
//   node feeder.mjs --resupply 15000   # a ship call: add 15 000 L to every day tank at start-up
//   node feeder.mjs --incident freezer_warming
//
// Incidents can also be switched live while it runs: write a name into
// ./incident.txt (empty the file to clear).
//   freezer_warming | generator_fault | fuel_leak | coolant_overheat
//
// Zero dependencies — Node 18+.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'

const args = process.argv.slice(2)
const flag = (n) => args.includes(`--${n}`)
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d
}

const ORIGIN = (opt('base', process.env.HIMADRI_BASE ?? 'https://himadri.aus1in.me')).replace(/\/$/, '')
const TOKEN = opt('token', process.env.HIMADRI_TOKEN ?? 'changeme_for_hackathon')
const CYCLE_S = Number(opt('interval', flag('fast') ? 8 : 60))
const HERE = path.dirname(fileURLToPath(import.meta.url))
const INCIDENT_FILE = path.join(HERE, 'incident.txt')
const ONCE = flag('once')

const bearer = { Authorization: `Bearer ${TOKEN}` }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

async function api(p, init = {}, root = '/api/v1') {
  const res = await fetch(`${ORIGIN}${root}${p}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${p} ${text.slice(0, 160)}`)
  return text ? JSON.parse(text) : null
}

// ── tiny deterministic noise ─────────────────────────────────────────────
let seed = 1337
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}
const noise = (amp) => (rnd() - 0.5) * 2 * amp
const hourOfDay = () => {
  const d = new Date()
  return d.getUTCHours() + d.getUTCMinutes() / 60
}
const diurnal = () => Math.sin(((hourOfDay() - 9) / 24) * 2 * Math.PI) // peaks ~15:00 UTC

// ── per-series state & generators ────────────────────────────────────────
const state = new Map() // key -> number
const poweredOff = new Set() // asset ids the operator has stopped from HQ
const setpoints = new Map() // asset id -> last commanded setpoint

// ── tiny control server for the in-app "Demo Director" ─────────────────────
// GET /state -> { incident, cycle, assets }   POST /incident {name}  ("" clears)
const control = { cycle: 0, assets: 0 }
const INCIDENTS = ['freezer_warming', 'generator_fault', 'fuel_leak', 'coolant_overheat']
function startControlServer() {
  const port = Number(opt('control-port', 7070))
  const server = http.createServer((req, res) => {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' }
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end() }
    if (req.method === 'GET' && req.url?.startsWith('/state')) {
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ incident: incidentName(), incidents: INCIDENTS, ...control }))
    }
    if (req.method === 'POST' && req.url?.startsWith('/incident')) {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        try {
          const name = (JSON.parse(body || '{}').name ?? '').toString()
          if (name && !INCIDENTS.includes(name)) throw new Error('unknown incident')
          fs.writeFileSync(INCIDENT_FILE, name)
          log('incident set from control server:', name || '(cleared)')
          res.writeHead(200, { ...cors, 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, incident: name }))
        } catch (e) {
          res.writeHead(400, { ...cors, 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: String(e.message ?? e) }))
        }
      })
      return
    }
    res.writeHead(404, cors)
    res.end()
  })
  server.on('error', (e) => log('control server not started:', e.code ?? e.message))
  server.listen(port, '127.0.0.1', () => log('control server on http://127.0.0.1:' + port))
}

function incidentName() {
  try {
    return fs.readFileSync(INCIDENT_FILE, 'utf8').trim() || opt('incident', '')
  } catch {
    return opt('incident', '')
  }
}

function genValue(assetId, label, unit, base) {
  const key = `${assetId}.${label}`
  const inc = incidentName()
  let cur = state.get(key)

  // ---- temperatures ----------------------------------------------------
  if (label === 'temp_c' && /freezer/.test(assetId)) {
    let v = -19 + noise(0.35)
    if (inc === 'freezer_warming' && /maitri-storage-freezer-01/.test(assetId)) {
      cur = Math.min(-12, (cur ?? -19) + 0.9)
      state.set(key, cur)
      return cur + noise(0.2)
    }
    state.delete(key)
    return v
  }
  if (label === 'temp_c' && /chiller/.test(assetId)) return 4 + noise(0.5)
  if (label === 'temp_c' && /aws/.test(assetId)) return (/bharati/.test(assetId) ? -6.5 : -9) + 4.5 * diurnal() + noise(0.4)
  if (label === 'supply_temp_c') return (/boiler/.test(assetId) ? 63 : 22.5) + noise(1.2)
  if (label === 'tank_temp_c') return 12 + noise(0.8)
  if (label === 'coolant_c') {
    if (inc === 'coolant_overheat' && /pistenbully-1/.test(assetId)) {
      cur = Math.min(118, (cur ?? 82) + 3)
      state.set(key, cur)
      return cur
    }
    state.delete(key)
    return 78 + noise(4)
  }

  // ---- power -----------------------------------------------------------
  if (label === 'power_kw') {
    if (poweredOff.has(assetId)) return 0.2 + Math.abs(noise(0.1))
    if (inc === 'generator_fault' && /maitri-power-generator-01/.test(assetId)) {
      cur = Math.max(2, (cur ?? 46) - 8)
      state.set(key, cur)
      return cur
    }
    state.delete(key)
    const mid = /chp/.test(assetId) ? 66 : /generator-3/.test(assetId) ? 38 : 47
    return mid + 6 * diurnal() + noise(3)
  }

  // ---- levels ----------------------------------------------------------
  if (label === 'level_l') {
    const isFuel = /fuel|buffer|cache/.test(assetId)
    if (cur === undefined) {
      const floor = /buffer/.test(assetId) ? 6000 : 26000
      cur = floor + (rnd() * (/buffer/.test(assetId) ? 2500 : 16000) | 0)
    }
    if (isFuel) {
      // litres per hour — ship/ice-shelf caches are stores, not day tanks
      let burn = /cache/.test(assetId) ? 0 : 7 + rnd() * 2
      if (inc === 'fuel_leak' && /maitri-storage-fuel-tank-01/.test(assetId)) burn = 180000
      cur = Math.max(0, cur - burn * (CYCLE_S / 3600))
    } else {
      cur += 0.8 * (CYCLE_S / 60) + rnd() * 0.5
      if (cur > 3600) cur = 400 // tank emptied by the waste crew
    }
    state.set(key, cur)
    return cur
  }

  // ---- misc ------------------------------------------------------------
  if (label === 'runhours') {
    cur = (cur ?? (base || 1200 + (rnd() * 3000 | 0))) + CYCLE_S / 3600
    state.set(key, cur)
    return cur
  }
  if (label === 'battery_pct') return 97 - 2 * Math.abs(diurnal()) + noise(0.4)
  if (label === 'solar_wm2') return Math.max(0, 260 + 240 * diurnal() + noise(14))
  if (label === 'h_nt') return (base || 14800) + noise(35) + 18 * Math.sin(Date.now() / 6e5)
  const b = base || 1
  return b + noise(Math.abs(b) * 0.012 + 0.01)
}

// ── main ─────────────────────────────────────────────────────────────────
async function loadFleet() {
  const [maitri, bharati, series] = await Promise.all([
    api('/assets?station=maitri', { headers: bearer }),
    api('/assets?station=bharati', { headers: bearer }),
    api('/series', { headers: bearer }),
  ])
  const byAsset = new Map()
  for (const s of series) {
    const label = s.label
    if (!byAsset.has(s.asset_id)) byAsset.set(s.asset_id, [])
    byAsset.get(s.asset_id).push({ label, unit: s.unit, key: s.key })
  }
  const assets = [...maitri, ...bharati]
  log(`fleet: ${assets.length} assets, ${series.length} series`)
  const fleet = []
  for (const a of assets) {
    try {
      const cred = await api(`/assets/${a.id}/credentials`, { headers: bearer })
      fleet.push({ id: a.id, key: cred.api_key, base: a.primary_value ?? 0, series: byAsset.get(a.id) ?? [], primary: a.primary_series })
    } catch (e) {
      log('no credentials for', a.id, e.message)
    }
  }
  return fleet
}

async function seedFromLatest(fleet) {
  const keys = fleet.flatMap((a) => a.series.filter((x) => x.label === "level_l" || x.label === "runhours").map((x) => x.key))
  if (!keys.length) return
  try {
    const latest = await api("/readings/latest?keys=" + keys.map(encodeURIComponent).join(","), { headers: bearer })
    let n = 0
    for (const [k, v] of Object.entries(latest)) {
      if (v && typeof v.value === "number" && v.value > 100) {
        const bump = Number(opt('resupply', 0))
        state.set(k, v.value + (bump && /level_l/.test(k) && !/cache|ship-transfer|buffer/.test(k) ? bump : 0))
        n++
      }
    }
    log("continuity: resumed " + n + " series from their last reported value")
  } catch (e) {
    log("could not read latest values:", e.message)
  }
}

async function beat(a) {
  const values = {}
  const units = {}
  for (const s of a.series) {
    const base = s.label === a.primary || a.series.length === 1 ? a.base : 0
    values[s.label] = Number(genValue(a.id, s.label, s.unit, base).toFixed(2))
    units[s.label] = s.unit
  }
  const body = {
    asset_id: a.id,
    timestamp: new Date().toISOString(),
    reading: { values, units },
    status: 'ok',
    simulation_active: false,
  }
  const res = await api('/agent/heartbeat', { method: 'POST', body: JSON.stringify(body), headers: { 'X-API-Key': a.key } }, '')
  if (res && res.pending_command) await executeCommand(a, res.pending_command)
  return res
}

// The station side of the two-phase command round trip: apply it to local
// state, then ack + report the result so the backend can mark it applied.
async function executeCommand(a, cmd) {
  let result = { applied: true }
  if (cmd.action === "stop") {
    poweredOff.add(a.id)
    result = { applied: true, powered: false }
  } else if (cmd.action === "start") {
    poweredOff.delete(a.id)
    result = { applied: true, powered: true }
  } else if (cmd.action === "setpoint") {
    setpoints.set(a.id, cmd.payload)
    result = { applied: true, setpoint: cmd.payload }
  } else if (cmd.action === "mode") {
    result = { applied: true, mode: cmd.payload?.mode ?? null }
  }
  try {
    await api("/agent/command-result", { method: "POST", body: JSON.stringify({ command_id: cmd.command_id, success: true, result }), headers: { "X-API-Key": a.key } }, "")
    log("command applied:", cmd.action, a.id)
  } catch (e) {
    log("command-result failed", a.id, e.message)
  }
}

async function backfill(fleet) {
  const keys = [
    'maitri-power-generator-01.power_kw',
    'maitri-power-generator-2.power_kw',
    'bharati-power-chp-01.power_kw',
    'maitri-storage-fuel-tank-01.level_l',
    'bharati-storage-fuel-tank-01.level_l',
    'maitri-instrument-aws-01.temp_c',
    'maitri-storage-freezer-01.temp_c',
  ]
  log(`backfilling 24h for ${keys.length} key series (30-minute steps)…`)
  const now = Date.now()
  for (const key of keys) {
    const [assetId, label] = [key.slice(0, key.lastIndexOf('.')), key.slice(key.lastIndexOf('.') + 1)]
    const asset = fleet.find((f) => f.id === assetId)
    if (!asset) continue
    let level = 41000 + rnd() * 3000
    for (let i = 48; i >= 1; i--) {
      const ts = new Date(now - i * 30 * 60 * 1000)
      const h = ts.getUTCHours() + ts.getUTCMinutes() / 60
      const d = Math.sin(((h - 9) / 24) * 2 * Math.PI)
      let v
      if (label === 'power_kw') v = (/chp/.test(assetId) ? 66 : /generator-2/.test(assetId) ? 44 : 47) + 6 * d + noise(2.5)
      else if (label === 'level_l') {
        level -= 10 * 0.5 + rnd() * 1.5
        v = level
      } else if (/aws/.test(assetId)) v = -9 + 4.5 * d + noise(0.5)
      else v = -19 + noise(0.3)
      try {
        await api(
          '/readings/manual',
          { method: 'POST', headers: bearer, body: JSON.stringify({ series_key: key, value: Number(v.toFixed(2)), ts: ts.toISOString(), entered_by: 'station-feeder (backfill)' }) },
        )
      } catch (e) {
        log('backfill failed', key, e.message)
        break
      }
    }
    if (label === 'level_l') state.set(key, level)
    log('  ✓', key)
  }
}

async function main() {
  log(`HIMADRI station feeder → ${ORIGIN}  (cycle ${CYCLE_S}s${ONCE ? ', once' : ''})`)
  const fleet = await loadFleet()
  control.assets = fleet.length
  startControlServer()
  if (flag('backfill')) await backfill(fleet)
  else await seedFromLatest(fleet)

  for (let cycle = 1; ; cycle++) {
    const started = Date.now()
    let ok = 0
    let fail = 0
    const pace = Math.max(60, Math.min(900, (CYCLE_S * 1000 * 0.8) / fleet.length))
    for (const a of fleet) {
      try {
        await beat(a)
        ok++
      } catch (e) {
        fail++
        if (fail <= 3) log('  heartbeat failed', a.id, e.message)
      }
      await sleep(pace)
    }
    const inc = incidentName()
    control.cycle = cycle
    log(`cycle ${cycle}: ${ok} ok / ${fail} failed${inc ? `  [incident: ${inc}]` : ''}`)
    if (ONCE) break
    const wait = Math.max(0, CYCLE_S * 1000 - (Date.now() - started))
    await sleep(wait)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
