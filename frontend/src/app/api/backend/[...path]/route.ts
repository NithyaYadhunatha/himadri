// GET/POST — a thin, allow-listed pass-through to the FastAPI backend for the
// command-centre pages (sync, audit verify, ML accuracy, energy, series, ...).
// Every call still goes through requireMembership() and the same station
// scoping the dedicated proxy routes use, so a station-locked account can't
// read the other station's data through here.
import { NextResponse } from 'next/server'
import { forwardStationScopedList, forwardToBackend, forwardToBackendWithStation, requireMembership, resolveStationParam } from '@/lib/apiProxy'
import { canViewAllStations, isStationRequestAllowed } from '@/lib/graph/departmentScope'

// Paths whose backend endpoint takes ?station= — scoped per membership.
const STATION_SCOPED = [
  'alerts',
  'commands',
  'energy',
  'logistics',
  'analytics/risk',
  'vehicles',
  'convoys',
  'inventory',
  'waste',
  'advisories',
  'alert-rules',
  'scenarios',
]
// Global, non-station-tagged data that is safe for every ACTIVE member.
const OPEN = ['audit/verify', 'sync/status', 'model-accuracy', 'series', 'readings/latest']
// Fleet-wide records with no station filter — HQ / admin / auditor only.
const FLEET_ONLY = ['devices', 'reports']

const GET_ALLOW = [...STATION_SCOPED, ...OPEN, ...FLEET_ONLY, 'audit', 'stations', 'assets']

const ASSET_SUBPATHS = ['blast-radius', 'dependencies', 'readings', 'alerts', 'passport']

// Pure computations only — nothing here mutates station state.
const POST_ALLOW = ['analytics/forecast', 'analytics/simulate']

function allowed(path: string, list: string[]) {
  return list.some((p) => path === p || path.startsWith(p + '/'))
}

type Ctx = { params: Promise<{ path: string[] }> }

export async function GET(req: Request, ctx: Ctx) {
  const { path } = await ctx.params
  const joined = path.join('/')
  if (!allowed(joined, GET_ALLOW)) {
    return NextResponse.json({ error: 'Path not exposed' }, { status: 404 })
  }
  const access = await requireMembership()
  if (!access.ok) return access.response

  const m = access.membership
  const url = new URL(req.url)

  if (joined === 'audit') {
    return forwardStationScopedList(req, '/audit', m)
  }
  if (joined === 'assets') {
    // asset list takes ?station= — same scoping as the other station lists
    const scoped = resolveStationParam(url.searchParams, m, { requireStation: true })
    if (!scoped.ok) return scoped.response
    return forwardToBackendWithStation(req, '/assets', scoped.station)
  }
  if (joined.startsWith('assets/')) {
    // per-asset reads: the asset id is prefixed with its station (maitri-… / bharati-…)
    const [, id = '', sub = ''] = joined.split('/')
    // never expose device credentials (api keys) through this proxy
    if (!ASSET_SUBPATHS.includes(sub)) return NextResponse.json({ error: 'Path not exposed' }, { status: 404 })
    const owner = id.startsWith('bharati-') ? 'bharati' : id.startsWith('maitri-') ? 'maitri' : null
    if (!owner || !isStationRequestAllowed(owner, m)) {
      return NextResponse.json({ error: 'Forbidden for this asset' }, { status: 403 })
    }
    return forwardToBackend(req, '/' + joined)
  }
  if (allowed(joined, STATION_SCOPED)) {
    const scoped = resolveStationParam(url.searchParams, m)
    if (!scoped.ok) return scoped.response
    return forwardToBackendWithStation(req, "/" + joined, scoped.station)
  }
  if (allowed(joined, FLEET_ONLY) && !canViewAllStations(m)) {
    return NextResponse.json({ error: 'Fleet-wide data is restricted to HQ roles' }, { status: 403 })
  }
  if (joined.startsWith('stations/')) {
    const id = joined.split('/')[1]
    if (!isStationRequestAllowed(id, m)) {
      return NextResponse.json({ error: 'Forbidden for this station' }, { status: 403 })
    }
  }
  return forwardToBackend(req, "/" + joined)
}

export async function POST(req: Request, ctx: Ctx) {
  const { path } = await ctx.params
  const joined = path.join('/')
  if (!allowed(joined, POST_ALLOW)) {
    return NextResponse.json({ error: 'Path not exposed' }, { status: 404 })
  }
  return forwardToBackend(req, `/${joined}`)
}
