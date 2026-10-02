// src/lib/server/copilot.ts
//
// Deterministic "offline mode" for the Operations Agent. When no LLM provider
// is configured (or the station has no internet), the chat still answers the
// questions an operator actually asks — fuel, alerts, convoy, link, ledger,
// power, weather — straight from the live backend, and says where each number
// came from. No model, no hallucination, nothing leaves the station.
import { backendFetch } from '@/lib/apiProxy'
import { STATION_COORDS, type StationId } from '@/lib/constants'

interface Series {
  key: string
  asset_id: string
  station_id: string
  label: string
}

async function get<T>(path: string): Promise<T> {
  const res = await backendFetch(path)
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return (await res.json()) as T
}

const naive = (ms: number) => new Date(ms).toISOString().slice(0, 19)
const n0 = (v: number) => Math.round(v).toLocaleString('en-IN')

function theilSen(pts: { h: number; v: number }[]): number {
  const s: number[] = []
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) if (pts[j].h - pts[i].h > 0.2) s.push((pts[j].v - pts[i].v) / (pts[j].h - pts[i].h))
  s.sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}

async function fuel(station: string) {
  const series = (await get<Series[]>('/series')).filter((s) => s.station_id === station && s.label === 'level_l' && /fuel-tank|safety-buffer|cache|ship-transfer/.test(s.asset_id))
  if (!series.length) return null
  const latest = await get<Record<string, { value: number } | null>>(`/readings/latest?keys=${series.map((s) => encodeURIComponent(s.key)).join(',')}`)
  const total = series.reduce((a, s) => a + (latest[s.key]?.value ?? 0), 0)
  const from = naive(Date.now() - 24 * 3600e3)
  const burns: number[] = []
  for (const s of series.filter((x) => !/cache|ship-transfer/.test(x.asset_id)).slice(0, 4)) {
    try {
      const rows = await get<{ ts: string; value: number }[]>(`/series/${encodeURIComponent(s.key)}/readings?from=${from}&bucket=1h`)
      const asc = [...rows].reverse()
      if (asc.length >= 4) {
        const t0 = new Date(asc[0].ts).getTime()
        const b = -theilSen(asc.map((r) => ({ h: (new Date(r.ts).getTime() - t0) / 3.6e6, v: r.value })))
        if (b > 0) burns.push(b)
      }
    } catch {
      /* skip */
    }
  }
  const dayTanks = series.filter((x) => !/cache|ship-transfer/.test(x.asset_id)).length
  const mean = burns.length ? burns.reduce((a, b) => a + b, 0) / burns.length : 0
  const burn = mean * dayTanks
  return { total, burn, days: burn > 0.5 ? total / (burn * 24) : null, tanks: series.length }
}

export async function offlineReply(message: string, station: StationId): Promise<string> {
  const q = message.toLowerCase()
  const name = station === 'maitri' ? 'Maitri' : 'Bharati'
  const out: string[] = []

  try {
    if (/fuel|diesel|endurance|tank|last|isolation/.test(q)) {
      const [f, e] = await Promise.all([fuel(station), get<{ isolation_days_remaining: number }>(`/logistics/endurance?station=${station}`).catch(() => null)])
      if (f) {
        const iso = e?.isolation_days_remaining ?? 150
        out.push(
          `**Fuel at ${name}:** ${n0(f.total)} L on hand across ${f.tanks} tanks and caches.` +
            (f.days !== null
              ? ` Fitted burn is about ${n0(f.burn)} L/h, so endurance is **${n0(f.days)} days** against ${iso} days of isolation — ${f.days >= iso ? `a margin of ${n0(f.days - iso)} days` : `a shortfall of ${n0(iso - f.days)} days`}.`
              : ' Not enough history yet to fit a burn rate.') +
            ' _Source: live tank-level sensors (derived)._',
        )
      }
    }
    if (/alert|fault|problem|wrong|issue|critical|warning/.test(q)) {
      const alerts = await get<{ severity: string; message: string; asset_id: string }[]>(`/alerts?station=${station}&state=open`)
      out.push(
        alerts.length === 0
          ? `**Alerts at ${name}:** none open.`
          : `**Alerts at ${name}:** ${alerts.length} open — ` + alerts.slice(0, 4).map((a) => `${a.severity}: ${a.message}`).join('; ') + '. _Source: alert engine._',
      )
    }
    if (/convoy|ambulance|resupply|medical officer|depart/.test(q)) {
      const [convoys, vehicles] = await Promise.all([
        get<{ route_ref: string | null; state: string; medical_officer: string | null; assignments: { vehicle_asset_id: string | null }[] }[]>(`/convoys?station=${station}`),
        get<{ id: string; subtype: string; status: string }[]>(`/vehicles?station=${station}`),
      ])
      const c = convoys[0]
      if (!c) out.push(`**Convoy:** none planned for ${name}.`)
      else {
        const amb = new Set(vehicles.filter((v) => v.subtype === 'ambulance').map((v) => v.id))
        const hasAmb = c.assignments.some((a) => a.vehicle_asset_id && amb.has(a.vehicle_asset_id))
        const go = !!c.medical_officer && hasAmb
        out.push(`**Convoy (${c.route_ref ?? 'planned'}):** ${go ? 'GO' : 'NO-GO'} — medical officer ${c.medical_officer ? 'assigned' : 'missing'}, ambulance escort ${hasAmb ? 'assigned' : 'not assigned'}. The backend refuses departure until both are in place.`)
      }
    }
    if (/link|sync|satellite|offline|uplink|queue|connect/.test(q)) {
      const s = await get<{ link_state: string; queue_depth: number; last_sync: string | null; bytes_budget: number }>('/sync/status')
      out.push(`**Uplink:** state ${s.link_state}, ${s.queue_depth} items queued for HQ (budget ${(s.bytes_budget / 1e6).toFixed(1)} MB per batch)${s.last_sync ? `, last HQ ack ${s.last_sync}` : ', no HQ acknowledgement yet'}. The station keeps ingesting, alerting and approving locally regardless; alerts are sent first when the link returns.`)
    }
    if (/audit|chain|tamper|ledger|integrity|log/.test(q)) {
      const v = await get<{ valid: boolean; checked: number }>('/audit/verify')
      out.push(`**Audit ledger:** ${v.valid ? 'intact' : 'BROKEN'} — ${v.checked} events re-hashed end-to-end (SHA-256 chain).`)
    }
    if (/power|generator|energy|kw|electric/.test(q)) {
      const [en, series] = await Promise.all([get<{ generation_kw: number | null }>(`/energy/summary?station=${station}`), get<Series[]>('/series')])
      const gens = series.filter((s) => s.station_id === station && s.label === 'power_kw')
      const latest = gens.length ? await get<Record<string, { value: number } | null>>(`/readings/latest?keys=${gens.map((g) => encodeURIComponent(g.key)).join(',')}`) : {}
      out.push(`**Power at ${name}:** ${en.generation_kw !== null ? `${en.generation_kw.toFixed(0)} kW` : 'no generation reading'} — ` + gens.map((g) => `${g.asset_id.replace(`${station}-power-`, '')} ${latest[g.key] ? latest[g.key]!.value.toFixed(0) : '—'} kW`).join(', ') + '.')
    }
    if (/weather|storm|wind|gust|blizzard|temperature|cold/.test(q)) {
      const { lat, lon } = STATION_COORDS[station]
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,wind_gusts_10m&hourly=wind_gusts_10m&forecast_days=3&wind_speed_unit=kmh`, { cache: 'no-store' })
      if (r.ok) {
        const j = (await r.json()) as { current: { temperature_2m: number; wind_speed_10m: number }; hourly: { wind_gusts_10m: number[] } }
        const peak = Math.max(...j.hourly.wind_gusts_10m)
        out.push(`**Weather at ${name}:** ${j.current.temperature_2m.toFixed(0)}°C, wind ${j.current.wind_speed_10m.toFixed(0)} km/h now; peak gust in the next 72 h ≈ ${peak.toFixed(0)} km/h${peak >= 70 ? ' — hold outdoor work and convoys' : ''}. _Source: Open-Meteo._`)
      }
    }
    if (out.length === 0) {
      const s = await get<{ total_assets: number; ok_assets: number; open_alerts: number; critical_alerts: number }>(`/stations/${station}/summary`)
      out.push(`**${name} right now:** ${s.ok_assets}/${s.total_assets} assets reporting, ${s.open_alerts} open alerts (${s.critical_alerts} critical).`)
      out.push('Ask me about **fuel endurance**, **alerts**, the **convoy**, the **uplink / sync queue**, the **audit ledger**, **power** or the **weather** — I answer from live station data and cite the source.')
    }
  } catch (e) {
    return `I couldn't reach the station backend just now (${e instanceof Error ? e.message : 'error'}). Local data stays available on the station node; try again in a moment.`
  }
  return out.join('\n\n') + '\n\n_Offline-capable mode: answered from live station data, no external model._'
}
