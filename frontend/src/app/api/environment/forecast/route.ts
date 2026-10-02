// GET /api/environment/forecast?station=maitri|bharati
//
// 7-day hourly outlook (plus the last 24 h) for the station's real coordinates
// from Open-Meteo — public regional weather, same trust model as
// /api/environment/weather. Used by the storm-watch panel on /environment.
import { NextResponse } from 'next/server'
import { STATION_COORDS, STATIONS, type StationId } from '@/lib/constants'

interface Hourly {
  time: string[]
  temperature_2m: number[]
  wind_speed_10m: number[]
  wind_gusts_10m: number[]
  surface_pressure: number[]
  snowfall: number[]
}

export async function GET(req: Request) {
  const station = new URL(req.url).searchParams.get('station') as StationId | null
  if (!station || !STATIONS.includes(station)) {
    return NextResponse.json({ error: 'station must be maitri or bharati' }, { status: 400 })
  }
  const { lat, lon } = STATION_COORDS[station]
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=temperature_2m,wind_speed_10m,wind_gusts_10m,surface_pressure,snowfall` +
    `&past_days=1&forecast_days=7&wind_speed_unit=kmh&timezone=UTC`
  try {
    const res = await fetch(url, { next: { revalidate: 900 } })
    if (!res.ok) return NextResponse.json({ error: `Open-Meteo ${res.status}` }, { status: 502 })
    const j = (await res.json()) as { hourly?: Hourly }
    if (!j.hourly) return NextResponse.json({ error: 'No hourly data' }, { status: 502 })
    const h = j.hourly
    return NextResponse.json({
      station,
      source: 'Open-Meteo',
      points: h.time.map((t, i) => ({
        t: new Date(t + 'Z').getTime(),
        temp: h.temperature_2m[i],
        wind: h.wind_speed_10m[i],
        gust: h.wind_gusts_10m[i],
        pressure: h.surface_pressure[i],
        snow: h.snowfall[i],
      })),
    })
  } catch {
    return NextResponse.json({ error: 'Weather service unreachable' }, { status: 502 })
  }
}
