// GET /api/environment/weather?station=maitri|bharati
//
// Live regional Antarctic conditions "around the station" (PolarTwin's
// environmental-monitoring feature) — proxies Open-Meteo's free, keyless
// forecast API (global model, covers polar latitudes) against the station's
// real-world coordinates. This is deliberately NOT a backend/RBAC-proxied
// route like the rest of /api/* — it's public, non-sensitive regional
// weather, not station-internal data, so it has no membership requirement
// and works standalone even with DEV_BYPASS_AUTH and no FastAPI backend
// running. Distinct from the AWS instrument's own health-score trend
// (nodeHealthService, category=instrument) — that's the station's on-site
// sensor's operational status; this is the actual live weather.
import { NextResponse } from 'next/server'
import { STATION_COORDS, STATIONS, type StationId } from '@/lib/constants'

// WMO weather codes (Open-Meteo's `weather_code`) collapsed to the subset
// that actually occurs in Antarctica.
const WEATHER_CODE_LABELS: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Rime fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Dense drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  71: 'Light snowfall',
  73: 'Snowfall',
  75: 'Heavy snowfall',
  77: 'Snow grains',
  80: 'Light showers',
  81: 'Showers',
  82: 'Violent showers',
  85: 'Light snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
}

interface OpenMeteoResponse {
  current?: {
    time: string
    temperature_2m: number
    relative_humidity_2m: number
    apparent_temperature: number
    wind_speed_10m: number
    wind_direction_10m: number
    wind_gusts_10m: number
    surface_pressure: number
    snowfall: number
    weather_code: number
    is_day: number
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const station = searchParams.get('station') as StationId | null
  if (!station || !STATIONS.includes(station)) {
    return NextResponse.json({ error: 'station must be one of: ' + STATIONS.join(', ') }, { status: 400 })
  }

  const { lat, lon } = STATION_COORDS[station]
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lon))
  url.searchParams.set('current', [
    'temperature_2m', 'relative_humidity_2m', 'apparent_temperature',
    'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m',
    'surface_pressure', 'snowfall', 'weather_code', 'is_day',
  ].join(','))
  url.searchParams.set('timezone', 'UTC')

  let upstream: Response
  try {
    upstream = await fetch(url.toString(), { next: { revalidate: 300 } })
  } catch {
    return NextResponse.json({ error: 'Weather service unreachable' }, { status: 502 })
  }
  if (!upstream.ok) {
    return NextResponse.json({ error: `Weather service returned ${upstream.status}` }, { status: 502 })
  }

  const data = (await upstream.json()) as OpenMeteoResponse
  const c = data.current
  if (!c) {
    return NextResponse.json({ error: 'Weather service returned no current conditions' }, { status: 502 })
  }

  return NextResponse.json({
    station,
    latitude: lat,
    longitude: lon,
    temperatureC: c.temperature_2m,
    feelsLikeC: c.apparent_temperature,
    windSpeedKmh: c.wind_speed_10m,
    windGustKmh: c.wind_gusts_10m,
    windDirectionDeg: c.wind_direction_10m,
    humidityPct: c.relative_humidity_2m,
    pressureHpa: c.surface_pressure,
    snowfallCm: c.snowfall,
    weatherCode: c.weather_code,
    weatherLabel: WEATHER_CODE_LABELS[c.weather_code] ?? 'Unknown',
    isDay: c.is_day === 1,
    observedAt: c.time,
    source: 'Open-Meteo',
  })
}
