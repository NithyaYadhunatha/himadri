// Central twin state (zustand — already the project's state manager).
// High-frequency data is split on purpose:
//  • `latest` changes per reading and is selected narrowly per asset;
//  • sample history lives in a module-level bounded buffer, and components
//    re-render from `tick`, which is throttled to ~1/s — never per sample.
import { create } from 'zustand'
import { ASSET_BY_ID, ASSETS, FRESHNESS, HISTORY_CAP, ROOMS } from './config'
import type { DataMode, Health, HeatmapState, LinkState, Reading, Sample, TwinAlert } from './types'

const history = new Map<string, Sample[]>()
export const getHistory = (id: string): Sample[] => history.get(id) ?? []
export const clearHistory = () => history.clear()

export type RightTab = 'configure' | 'analytics' | 'telemetry' | 'alerts' | 'simulation' | 'layers' | 'settings'

interface TwinState {
  mode: DataMode
  link: LinkState
  scene: 'loading' | 'ready' | 'error'
  setScene: (s: 'loading' | 'ready' | 'error') => void
  lastDataAt: number | null
  latest: Record<string, Reading>
  tick: number
  selectedId: string | null
  roomId: string | null
  panel: RightTab | null
  alerts: TwinAlert[]
  newAlertFlash: number
  heatmap: HeatmapState
  layers: Record<string, boolean>
  setMode: (m: DataMode) => void
  setLink: (l: LinkState) => void
  ingest: (rs: Reading[], demo: boolean) => void
  select: (id: string | null) => void
  selectRoom: (id: string | null) => void
  setPanel: (p: RightTab | null) => void
  setHeatmap: (p: Partial<HeatmapState>) => void
  setLayer: (k: string, on: boolean) => void
  ack: (id: string) => void
  dismiss: (id: string) => void
  reset: () => void
}

let lastTick = 0
let alertSeq = 0

export const useTwin = create<TwinState>((set, get) => ({
  mode: 'live',
  link: 'connecting',
  scene: 'loading',
  setScene: (scene) => set({ scene }),
  lastDataAt: null,
  latest: {},
  tick: 0,
  selectedId: null,
  roomId: null,
  panel: 'analytics',
  alerts: [],
  newAlertFlash: 0,
  heatmap: { on: false, opacity: 60, variable: 'temperature' },
  layers: { labels: true, rooms: true, sensors: true },

  setMode: (mode) => { clearHistory(); set({ mode, latest: {}, alerts: [], lastDataAt: null, link: mode === 'demo' ? 'live' : 'connecting', tick: get().tick + 1 }) },
  setLink: (link) => { if (get().link !== link) set({ link }) },

  ingest: (rs, demo) => {
    const s = get()
    // Never mix demo into live or the reverse (a late poll after a mode switch).
    if (demo !== (s.mode === 'demo') || rs.length === 0) return
    const latest = { ...s.latest }
    const fresh: TwinAlert[] = []
    for (const r of rs) {
      const prev = latest[r.assetId]
      latest[r.assetId] = r
      const buf = history.get(r.assetId) ?? []
      // Gateway batches resend identical timestamps; keep one sample per backend timestamp.
      if (r.status !== 'offline' && buf[buf.length - 1]?.t !== r.timestamp) {
        buf.push({ t: r.timestamp, v: r.value })
        if (buf.length > HISTORY_CAP) buf.splice(0, buf.length - HISTORY_CAP)
        history.set(r.assetId, buf)
      }
      const a = ASSET_BY_ID[r.assetId]
      if (!prev || prev.status === r.status) {
        if (prev && a?.boolean && prev.value !== r.value && r.status !== 'offline') {
          fresh.push(mk('info', r, `${a.name}: ${a.stateLabels?.[r.value ? 1 : 0] ?? r.value}`, demo))
        }
        continue
      }
      if (r.status === 'warning' || r.status === 'critical') {
        fresh.push(mk(r.status, r, `${a.name} ${r.status === 'critical' ? 'critical' : 'warning'}`, demo))
      } else if (prev.status === 'offline' && r.status === 'normal') {
        fresh.push(mk('info', r, `${a.name} back online`, demo))
      } else if (r.status === 'offline' && prev.status !== 'offline') {
        fresh.push(mk('warning', r, `${a.name} went offline`, demo))
      }
    }
    const now = Date.now()
    const patch: Partial<TwinState> = { latest, lastDataAt: now }
    if (now - lastTick > 1000) { patch.tick = s.tick + 1; lastTick = now }
    if (fresh.length) {
      patch.alerts = [...fresh, ...s.alerts].slice(0, 60)
      patch.newAlertFlash = s.newAlertFlash + 1
    }
    set(patch)
  },

  select: (selectedId) => {
    const room = selectedId ? ASSET_BY_ID[selectedId]?.roomId ?? null : get().roomId
    set({ selectedId, roomId: room, panel: selectedId ? 'analytics' : get().panel })
  },
  selectRoom: (roomId) => set({ roomId }),
  setPanel: (panel) => set({ panel }),
  setHeatmap: (p) => set({ heatmap: { ...get().heatmap, ...p } }),
  setLayer: (k, on) => set({ layers: { ...get().layers, [k]: on } }),
  ack: (id) => set({ alerts: get().alerts.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)) }),
  dismiss: (id) => set({ alerts: get().alerts.filter((a) => a.id !== id) }),
  reset: () => { clearHistory(); set({ latest: {}, alerts: [], lastDataAt: null, tick: get().tick + 1 }) },
}))

function mk(level: TwinAlert['level'], r: Reading, title: string, demo: boolean): TwinAlert {
  return { id: `a${++alertSeq}`, level, assetId: r.assetId, roomId: ASSET_BY_ID[r.assetId]?.roomId ?? '', title, at: Date.now(), acknowledged: false, demo }
}

// ── derived helpers (pure) ───────────────────────────────────────────────────
export function isStale(r: Reading | undefined, now = Date.now()) {
  return !!r && r.status !== 'offline' && now - r.receivedAt > FRESHNESS.staleMs
}
export function effectiveStatus(r: Reading | undefined, now = Date.now()): Health {
  if (!r) return 'offline'
  return isStale(r, now) ? 'offline' : r.status
}
const RANK: Record<Health, number> = { normal: 0, offline: 1, warning: 2, critical: 3 }
export function roomStatus(latest: Record<string, Reading>, roomId: string, now = Date.now()): Health {
  const as = ASSETS.filter((a) => a.roomId === roomId && a.hardware)
  const sts = as.map((a) => effectiveStatus(latest[a.id], now))
  if (sts.length && sts.every((s) => s === 'offline')) return 'offline'
  return sts.reduce<Health>((w, s) => (s !== 'offline' && RANK[s] > RANK[w] ? s : w), 'normal')
}
export const ROOM_IDS = ROOMS.map((r) => r.id)
