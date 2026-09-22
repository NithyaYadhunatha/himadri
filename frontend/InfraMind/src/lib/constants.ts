// src/lib/constants.ts

export const LIVE_ASSET_COUNT = 70

export const STATIONS = ['maitri', 'bharati'] as const
export type StationId = (typeof STATIONS)[number]

export const STATION_LABELS: Record<StationId, string> = {
  maitri: 'Maitri',
  bharati: 'Bharati',
}

// Real station coordinates — used to fetch live regional weather (see
// /api/environment/weather), not for the twin's own indoor layout.
export const STATION_COORDS: Record<StationId, { lat: number; lon: number }> = {
  maitri: { lat: -70.7669, lon: 11.7333 }, // Schirmacher Oasis, Queen Maud Land
  bharati: { lat: -69.4067, lon: 76.1900 }, // Larsemann Hills, Princess Elizabeth Land
}

// Mirrors backend/models/tables.py's ASSET_CATEGORIES exactly — this is the
// single domain taxonomy shared by the 2D twin, filter bars, panels, and
// device-onboarding form.
export const ASSET_CATEGORIES = [
  'power',
  'heating',
  'water',
  'waste',
  'vehicle',
  'instrument',
  'storage',
  'medical',
  'comms',
  'structure',
] as const

export const HEALTH_STATUS = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  CRITICAL: 'critical',
  UNREACHABLE: 'unreachable',
} as const

// Mirrors backend/models/tables.py's PROVENANCE_VALUES — every station fact
// carries one of these and the UI renders it as a small badge (FR-96,
// architecture doc's "Provenance" cross-cutting concern).
export const PROVENANCE_VALUES = ['verified', 'documentary', 'unverified', 'simulated'] as const
export type Provenance = (typeof PROVENANCE_VALUES)[number]

export const PROVENANCE_LABELS: Record<Provenance, string> = {
  verified: 'Verified',
  documentary: 'Documentary',
  unverified: 'Unverified',
  simulated: 'Simulated',
}

// Kept in sync with the `--color-emerald` / `--color-amber` / `--color-crimson`
// / `--color-cyan` tokens in globals.css — this is the plain-hex mirror used
// wherever a JS-level color is needed (SVG stroke/fill, Recharts) instead of
// a Tailwind class.
export const HEALTH_COLORS = {
  healthy: '#1F9E6D',
  degraded: '#B8720F',
  warning: '#B8720F',
  critical: '#B23A2E',
  unreachable: '#6E8AA0',
  // "cyan" is the design-token name for "Interactive / AI / Simulated" (a
  // glacier blue here) — used for assets whose readings are synthetic
  // (isSimulating === true / a device agent is injecting a fault) so they
  // don't read as healthy-green or degrade into the amber/crimson buckets.
  simulating: '#1868A0',
} as const

export const ASSET_CATEGORY_ABBREV: Record<string, string> = {
  power: 'PWR',
  heating: 'HTG',
  water: 'WTR',
  waste: 'WST',
  vehicle: 'VEH',
  instrument: 'INS',
  storage: 'STO',
  medical: 'MED',
  comms: 'COM',
  structure: 'STR',
  custom: 'CUS',
}

export const ROUTES = {
  TWIN: '/twin',
  TWIN_3D: '/twin/3d',
  TWIN_FLOORPLAN: '/twin/floorplan',
  ASSETS: '/assets',
  PREDICTIVE: '/predictive',
  RISK: '/risk',
  DIAGNOSIS: '/diagnosis',
  ENERGY: '/energy',
  LOGISTICS: '/logistics',
  ENVIRONMENT: '/environment',
  ALERTS: '/alerts',
  REMOTE_CONTROL: '/remote-control',
  SIMULATION: '/simulation',
  QR_SHEET: '/assets/qr-sheet',
  ADMIN_DEVICES: '/admin/devices',
  ADMIN_TEAM: '/admin/team',
  ADMIN_NOTIFICATIONS: '/admin/notifications',
  AUDIT: '/audit',
} as const

// The primary tab bar. Every non-admin page belongs to exactly one of
// these groups; the sub-nav row shows ONLY that group's own items — admin
// pages (Team/Devices/Audit) live in ADMIN_GROUP instead, appended
// separately and only for admins, so they stop cluttering every other
// page's sub-nav (see Navbar.tsx). Order: Station Twin, Operations,
// Simulation, Predictive & Risk, (Admin last, appended separately). Remote
// Control (PS 26060's "efficient remote management" requirement, FR-9…15)
// lives as Station Twin's last sub-tab — "here's what exists" (the twin)
// leads straight into "here's how you act on it" (remote control) within
// the same group, rather than getting its own top-level tab. The
// Operations Agent used to have its own tab/page here — it's now a
// floating chat widget only (MCPChatPanel, mounted globally in
// DashboardLayout), not a nav destination. QR Sheet used to be a permanent
// Station Twin tab — it's now a button on /assets, since it's a
// rarely-used printable-sheet generator, not a page people navigate to
// directly.
export const NAV_GROUPS = [
  {
    label: 'STATION TWIN',
    items: [
      { label: 'Floor Plan', href: ROUTES.TWIN_FLOORPLAN },
      { label: '2D Twin', href: ROUTES.TWIN },
      { label: '3D Twin', href: ROUTES.TWIN_3D },
      { label: 'Assets', href: ROUTES.ASSETS },
      { label: 'Remote Control', href: ROUTES.REMOTE_CONTROL },
    ],
  },
  {
    label: 'OPERATIONS',
    items: [
      { label: 'Energy', href: ROUTES.ENERGY },
      { label: 'Logistics', href: ROUTES.LOGISTICS },
      { label: 'Environment', href: ROUTES.ENVIRONMENT },
      { label: 'Alerts', href: ROUTES.ALERTS },
    ],
  },
  {
    label: 'SIMULATION',
    items: [{ label: 'What-If Scenarios', href: ROUTES.SIMULATION }],
  },
  {
    label: 'PREDICTIVE & RISK',
    items: [
      { label: 'Forecast', href: ROUTES.PREDICTIVE },
      { label: 'Risk Heatmap', href: ROUTES.RISK },
      { label: 'Diagnosis', href: ROUTES.DIAGNOSIS },
    ],
  },
] as const

export const ADMIN_GROUP = {
  label: 'ADMIN',
  items: [
    { label: 'Team', href: ROUTES.ADMIN_TEAM },
    { label: 'Devices', href: ROUTES.ADMIN_DEVICES },
    { label: 'Notifications', href: ROUTES.ADMIN_NOTIFICATIONS },
    { label: 'Audit Log', href: ROUTES.AUDIT },
  ],
} as const

export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === 'true'
