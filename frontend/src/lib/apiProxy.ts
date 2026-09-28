// src/lib/apiProxy.ts
//
// Shared helper for the many thin Next.js API routes under src/app/api/*
// that do nothing but forward a request to the FastAPI backend with the
// Bearer token attached, after checking the caller has an ACTIVE
// membership — the same pattern src/app/api/nodes/route.ts and
// src/app/api/fleet/*'s routes were written against by hand. Centralizing it
// here keeps each of the ~20 new proxy routes (scenarios, risk, diagnosis,
// logistics, inventory, convoys, waste, advisories, reports, devices, audit,
// alerts) to a few lines instead of repeating the same fetch/error-shape
// boilerplate everywhere.
//
// This does NOT apply station-scoping — callers that need it (asset/graph
// endpoints, per lib/graph/departmentScope.ts) filter the response
// themselves after calling backendFetch, since scoping rules differ per
// resource shape (some are station-scoped lists, some are single station
// query params, some have no station concept at all).

import { NextResponse } from 'next/server'
import { getCurrentMembership, type ActiveMembership } from '@/lib/auth/rbac'
import {
  canViewAllStations,
  defaultStationId,
  isStationRequestAllowed,
} from '@/lib/graph/departmentScope'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://himadri.aus1in.me/api/v1'
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN ?? ''

export async function backendFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  })
}

/** Returns the ACTIVE membership, or a ready-to-return 403 NextResponse. */
export async function requireMembership(): Promise<
  { ok: true; membership: ActiveMembership } | { ok: false; response: NextResponse }
> {
  const membership = await getCurrentMembership()
  if (!membership) {
    return { ok: false, response: NextResponse.json({ error: 'Membership not active' }, { status: 403 }) }
  }
  return { ok: true, membership }
}

/**
 * Forwards the current request (method, JSON body, and — unless
 * `dropSearchParams` is set — its query string) to `backendPath` on the
 * FastAPI backend, and relays the response (or a normalized error) back.
 * `backendPath` should NOT include a query string; pass `search` to append
 * one explicitly instead (used when the route needs to transform/validate
 * query params rather than pass them through verbatim).
 */
export async function forwardToBackend(
  req: Request,
  backendPath: string,
  opts?: { method?: string; search?: string; dropSearchParams?: boolean },
): Promise<NextResponse> {
  const access = await requireMembership()
  if (!access.ok) return access.response

  const method = opts?.method ?? req.method
  const url = new URL(req.url)
  const search = opts?.search ?? (opts?.dropSearchParams ? '' : url.search)

  let body: string | undefined
  if (method !== 'GET' && method !== 'HEAD' && method !== 'DELETE') {
    body = await req.text().catch(() => undefined)
  }

  let res: Response
  try {
    res = await backendFetch(`${backendPath}${search}`, { method, body: body || undefined })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }

  const text = await res.text()
  if (!res.ok) {
    return NextResponse.json(
      { error: text || `Backend ${res.status}` },
      { status: res.status },
    )
  }
  if (res.status === 204 || !text) {
    return new NextResponse(null, { status: res.status })
  }
  try {
    return NextResponse.json(JSON.parse(text))
  } catch {
    return new NextResponse(text, { status: res.status })
  }
}

// ─── Station-scoping helpers ─────────────────────────────────────────────
//
// The generic forwardToBackend() above deliberately does NOT apply station
// scoping (see the file header). The helpers below give the per-resource
// routes a few common shapes to enforce it in, per lib/graph/departmentScope.ts:
//
//  - resolveStationParam:  a route that takes an optional/required `?station=`
//    query param (alerts, convoys, vehicles, waste, advisories, inventory,
//    alert-rules, scenarios, analytics/risk, logistics/endurance).
//  - requireAllowedStation / requireAllowedStationOrFleetWide: a route whose
//    POST body carries a `station_id` (convoys, waste, scenarios, reports,
//    alert-rules).
//  - forwardStationScopedList: a route whose backend list endpoint has no
//    `?station=` filter at all (audit, reports) — fetched unfiltered, then
//    filtered here. Items with a null station_id (fleet-wide records) stay
//    visible to everyone.
//  - findStationScopedOrNotFound: a route that acts on one already-created
//    resource by id (alerts/{id}/ack, convoys/{id}/assign, devices/{id}/approve,
//    advisories/{id}/accept|reject, inventory/{id}/count) where the backend
//    has no single-item GET to check ownership against — so this looks the
//    item up in its list endpoint first.

/**
 * Resolves the `?station=` query param for a station-scoped list/summary
 * route. A supplied value must be one the caller is allowed to see (403
 * otherwise). With none supplied: a station-locked caller is defaulted to
 * their own station (so the backend does the filtering for us); an
 * HQ/Admin/Auditor caller gets `null` — no constraint, "all stations" — unless
 * `requireStation` is set (the backend endpoint has no "all stations" mode,
 * e.g. analytics/risk, logistics/endurance), in which case they're defaulted
 * too (to their nominal home station, 'maitri').
 */
export function resolveStationParam(
  searchParams: URLSearchParams,
  membership: ActiveMembership,
  opts?: { requireStation?: boolean },
): { ok: true; station: string | null } | { ok: false; response: NextResponse } {
  const requested = searchParams.get('station')
  if (requested) {
    if (!isStationRequestAllowed(requested, membership)) {
      return { ok: false, response: NextResponse.json({ error: 'Forbidden for this station' }, { status: 403 }) }
    }
    return { ok: true, station: requested }
  }
  if (!opts?.requireStation && canViewAllStations(membership)) return { ok: true, station: null }
  return { ok: true, station: defaultStationId(membership) }
}

/** Forwards `req` to `backendPath`, overwriting/dropping its `station` query
 * param with the resolved value from resolveStationParam (`null` drops it). */
export async function forwardToBackendWithStation(
  req: Request,
  backendPath: string,
  station: string | null,
  opts?: { method?: string },
): Promise<NextResponse> {
  const url = new URL(req.url)
  if (station) url.searchParams.set('station', station)
  else url.searchParams.delete('station')
  const search = [...url.searchParams.keys()].length ? `?${url.searchParams.toString()}` : ''
  return forwardToBackend(req, backendPath, { method: opts?.method, search })
}

/** For a POST/PATCH body that carries a required `station_id`: 403s unless
 * it's present and the caller is allowed to write to that station. */
export function requireAllowedStation(
  stationId: string | null | undefined,
  membership: ActiveMembership,
): NextResponse | null {
  if (!stationId || !isStationRequestAllowed(stationId, membership)) {
    return NextResponse.json({ error: 'Forbidden for this station' }, { status: 403 })
  }
  return null
}

/** For a POST body whose `station_id` is nullable (null/absent = fleet-wide):
 * fleet-wide writes are only allowed for callers who can already see every
 * station; a concrete station_id must still be one the caller may write to. */
export function requireAllowedStationOrFleetWide(
  stationId: string | null | undefined,
  membership: ActiveMembership,
): NextResponse | null {
  if (!stationId) {
    return canViewAllStations(membership)
      ? null
      : NextResponse.json({ error: 'Forbidden — station_id required' }, { status: 403 })
  }
  return requireAllowedStation(stationId, membership)
}

/** Fetches `backendPath` (a list with no `?station=` filter available) and
 * filters it down to what `membership` may see. Items with a null
 * `station_id` (fleet-wide records) are kept for everyone. */
export async function forwardStationScopedList<T extends { station_id: string | null }>(
  req: Request,
  backendPath: string,
  membership: ActiveMembership,
): Promise<NextResponse> {
  const url = new URL(req.url)
  let res: Response
  try {
    res = await backendFetch(`${backendPath}${url.search}`)
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }
  const text = await res.text()
  if (!res.ok) {
    return NextResponse.json({ error: text || `Backend ${res.status}` }, { status: res.status })
  }
  const raw = (text ? JSON.parse(text) : []) as T[]
  if (canViewAllStations(membership)) return NextResponse.json(raw)
  return NextResponse.json(raw.filter((item) => item.station_id === null || isStationRequestAllowed(item.station_id, membership)))
}

/** Looks up `id` in `listPath`'s response (the backend has no single-item GET
 * for this resource) and 404s if it doesn't exist or belongs to a station
 * `membership` can't see — same "don't leak existence" shape as
 * /api/nodes/[id]. Returns the found item so the caller can act on it. */
export async function findStationScopedOrNotFound<T extends { id: string; station_id: string | null }>(
  listPath: string,
  id: string,
  membership: ActiveMembership,
): Promise<{ ok: true; item: T } | { ok: false; response: NextResponse }> {
  let res: Response
  try {
    res = await backendFetch(listPath)
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Backend unreachable' }, { status: 502 }) }
  }
  if (!res.ok) {
    return { ok: false, response: NextResponse.json({ error: `Backend ${res.status}` }, { status: res.status }) }
  }
  const list = (await res.json()) as T[]
  const item = list.find((x) => x.id === id)
  if (!item || (item.station_id !== null && !isStationRequestAllowed(item.station_id, membership))) {
    return { ok: false, response: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  }
  return { ok: true, item }
}
