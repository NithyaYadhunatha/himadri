// src/services/commands.service.ts
//
// Remote Control (FR-9…14, C4) — the two-phase actuation state machine.
// Proxied through Next.js routes under /api/commands/* (see
// src/app/api/commands/*), mirroring backend/routers/commands.py and
// backend/services/command_engine.py exactly: queued -> sent -> acked ->
// applied, plus failed/expired. A life_safety asset's command sits in
// 'queued' until a second, different authorised user approves it (FR-11)
// or its 15-minute window lapses (expired).
//
// Mock mode re-implements that same state machine client-side (in-memory
// module state, not persisted — matches scenario.service.ts's own mock
// convention) rather than faking a single canned result: a created command
// genuinely walks queued -> sent -> acked -> applied on ~1.5s timers, and a
// life_safety command genuinely stalls in 'queued' until approve() is
// called with a *different* issuer — approve() enforces that the same way
// command_engine.approve_command() does (throws, doesn't silently allow
// it), so the mock demonstrates the real FR-11 rule rather than just
// UI-gating it. The single-mock-user dev environment (DEV_BYPASS_AUTH) means
// the real backend path would always reject a self-approval too — see the
// Remote Control page for how the "different approver name" UI gate stands
// in for a second logged-in person.
import { USE_MOCK } from '@/lib/constants'
import { mockControllableAssets, type ControllableAssetDef, type CommandActionKind } from '@/lib/mockData/mockCommands'
import type { NodeType } from '@/types/graph'

export type CommandAction = 'setpoint' | 'start' | 'stop' | 'mode'
export type CommandState = 'queued' | 'sent' | 'acked' | 'applied' | 'failed' | 'expired'

export interface CommandRecord {
  id: string
  station_id: string
  asset_id: string
  action: CommandAction
  payload: Record<string, unknown>
  issued_by: string
  issued_role: string
  issued_from: 'station' | 'hq'
  requires_second_approval: boolean
  approved_by: string | null
  approved_at: string | null
  state: CommandState
  expires_at: string
  acked_at: string | null
  applied_at: string | null
  created_at: string
  result: Record<string, unknown> | null
}

/** A controllable asset as the Remote Control page renders it — merges the
 * (mock or backend) static definition with its current live value, so the
 * page doesn't need separate "asset" and "asset state" lookups. */
export interface RemoteAsset {
  id: string
  name: string
  stationId: string
  category: NodeType
  subtype?: string
  lifeSafety: boolean
  status: string
  primaryValue: number | null
  primaryUnit: string | null
  actions: CommandActionKind[]
  setpointField?: string
  setpointUnit?: string
  setpointMin?: number
  setpointMax?: number
  modeOptions?: string[]
}

export interface CreateCommandInput {
  asset_id: string
  action: CommandAction
  payload: Record<string, unknown>
  issued_from?: 'station' | 'hq'
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Request failed (${res.status})`)
  }
  return res.json()
}

// ─── Real-mode helpers ──────────────────────────────────────────────────────
// The backend's list endpoint (AssetListItem) doesn't carry controllable/
// life_safety — only the single-asset GET (AssetDetail) does — so building
// the controllable roster against a live backend means one list fetch plus
// one detail fetch per asset, same N+1 shape nodeHealthService.getNodes
// already uses for its own per-asset hydration at this station's scale.
interface BackendAssetListItemMin { id: string; station_id: string }
interface BackendAssetDetailMin {
  id: string
  name: string
  station_id: string
  category: NodeType
  subtype: string | null
  controllable: boolean
  life_safety: boolean
  status: string
  primary_value: number | null
  primary_unit: string | null
}

const CATEGORY_ACTION_HINTS: Partial<Record<NodeType, CommandActionKind[]>> = {
  power: ['start', 'stop', 'mode'],
  heating: ['setpoint', 'start', 'stop'],
  water: ['start', 'stop', 'setpoint'],
  waste: ['start', 'stop', 'mode'],
  vehicle: ['start', 'stop'],
  comms: ['start', 'stop', 'mode'],
  instrument: ['start', 'stop'],
}

const CATEGORY_MODE_OPTIONS: Partial<Record<NodeType, string[]>> = {
  power: ['auto-load-share', 'manual'],
  waste: ['aerobic-cycle', 'anaerobic-cycle', 'standby'],
  comms: ['auto-track', 'manual-point'],
}

function toRemoteAsset(a: BackendAssetDetailMin): RemoteAsset {
  return {
    id: a.id,
    name: a.name,
    stationId: a.station_id,
    category: a.category,
    subtype: a.subtype ?? undefined,
    lifeSafety: a.life_safety,
    status: a.status,
    primaryValue: a.primary_value,
    primaryUnit: a.primary_unit,
    actions: CATEGORY_ACTION_HINTS[a.category] ?? ['start', 'stop'],
    setpointField: a.category === 'heating' ? 'setpoint_c' : a.category === 'water' ? 'flow_target_lpm' : undefined,
    setpointUnit: a.category === 'heating' ? '°C' : a.category === 'water' ? 'L/min' : undefined,
    setpointMin: a.category === 'heating' ? 16 : a.category === 'water' ? 100 : undefined,
    setpointMax: a.category === 'heating' ? 24 : a.category === 'water' ? 250 : undefined,
    modeOptions: CATEGORY_MODE_OPTIONS[a.category],
  }
}

// ─── Mock engine ────────────────────────────────────────────────────────────

const TRANSITION_DELAY_MS = 1500
const LIFE_SAFETY_WINDOW_MIN = 15
const STANDARD_WINDOW_MIN = 30

const mockAssetState = new Map<string, { status: string; primaryValue: number }>(
  mockControllableAssets.map((a) => [a.id, { status: a.status, primaryValue: a.primaryValue }]),
)
const mockCommands: CommandRecord[] = []
let mockCounter = 0

function mockAssetDef(id: string): ControllableAssetDef | undefined {
  return mockControllableAssets.find((a) => a.id === id)
}

function applyMockEffect(cmd: CommandRecord, asset: ControllableAssetDef) {
  const state = mockAssetState.get(asset.id)
  if (!state) return
  if (cmd.action === 'start') {
    state.status = 'running'
    state.primaryValue = asset.nominalValue
  } else if (cmd.action === 'stop') {
    state.status = 'stopped'
    state.primaryValue = asset.subtype === 'pistenbully' ? -8 : 0
  } else if (cmd.action === 'setpoint') {
    const field = asset.setpointField ?? 'setpoint'
    const v = cmd.payload[field]
    if (typeof v === 'number') state.primaryValue = v
  } else if (cmd.action === 'mode') {
    const mode = cmd.payload.mode
    if (typeof mode === 'string') state.status = mode
  }
}

function scheduleMockProgression(cmd: CommandRecord) {
  const asset = mockAssetDef(cmd.asset_id)
  if (!asset) return
  setTimeout(() => {
    if (cmd.state !== 'queued') return
    cmd.state = 'sent'
    setTimeout(() => {
      if (cmd.state !== 'sent') return
      cmd.state = 'acked'
      cmd.acked_at = new Date().toISOString()
      setTimeout(() => {
        if (cmd.state !== 'acked') return
        applyMockEffect(cmd, asset)
        cmd.state = 'applied'
        cmd.applied_at = new Date().toISOString()
        cmd.result = { asset_id: asset.id, action: cmd.action, applied_value: mockAssetState.get(asset.id)?.primaryValue ?? null }
      }, TRANSITION_DELAY_MS)
    }, TRANSITION_DELAY_MS)
  }, TRANSITION_DELAY_MS)
}

// Mirrors command_engine.expire_due_commands — sweeps queued life-safety
// commands whose 15-minute approval window has lapsed.
if (USE_MOCK && typeof window !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const cmd of mockCommands) {
      if (cmd.state === 'queued' && cmd.requires_second_approval && !cmd.approved_at && new Date(cmd.expires_at).getTime() < now) {
        cmd.state = 'expired'
      }
    }
  }, 15_000)
}

const assetCache = new Map<string, { at: number; promise: Promise<RemoteAsset[]> }>()

export const commandsService = {
  /** The controllable-asset roster for `station`, each with its current
   * (possibly command-mutated) live value. */
  listControllableAssets: async (station: string): Promise<RemoteAsset[]> => {
    if (USE_MOCK) {
      return Promise.resolve(
        mockControllableAssets
          .filter((a) => a.stationId === station)
          .map((a) => {
            const state = mockAssetState.get(a.id)
            return {
              id: a.id,
              name: a.name,
              stationId: a.stationId,
              category: a.category,
              subtype: a.subtype,
              lifeSafety: a.lifeSafety,
              status: state?.status ?? a.status,
              primaryValue: state?.primaryValue ?? a.primaryValue,
              primaryUnit: a.primaryUnit,
              actions: a.actions,
              setpointField: a.setpointField,
              setpointUnit: a.setpointUnit,
              setpointMin: a.setpointMin,
              setpointMax: a.setpointMax,
              modeOptions: a.modeOptions,
            }
          }),
      )
    }
    // One detail fetch per asset is expensive, and the page polls — cache per
    // station for 20 s and share an in-flight request so polling stays cheap.
    const hit = assetCache.get(station)
    if (hit && Date.now() - hit.at < 20_000) return hit.promise
    const promise = (async () => {
      const list = await json<BackendAssetListItemMin[]>(await fetch('/api/nodes'))
      const scoped = list.filter((a) => a.station_id === station)
      const details: (BackendAssetDetailMin | null)[] = []
      for (let i = 0; i < scoped.length; i += 8) {
        const chunk = scoped.slice(i, i + 8)
        details.push(...(await Promise.all(chunk.map((a) => fetch(`/api/nodes/${encodeURIComponent(a.id)}`).then((r) => (r.ok ? (r.json() as Promise<BackendAssetDetailMin>) : null))))))
      }
      return details.filter((d): d is BackendAssetDetailMin => !!d && d.controllable).map(toRemoteAsset)
    })()
    assetCache.set(station, { at: Date.now(), promise })
    promise.catch(() => assetCache.delete(station))
    return promise
  },

  list: async (station: string, state?: CommandState): Promise<CommandRecord[]> => {
    if (USE_MOCK) {
      return Promise.resolve(
        mockCommands
          .filter((c) => c.station_id === station && (!state || c.state === state))
          .sort((a, b) => b.created_at.localeCompare(a.created_at)),
      )
    }
    const qs = new URLSearchParams({ station })
    if (state) qs.set('state', state)
    return json(await fetch(`/api/commands?${qs.toString()}`))
  },

  get: async (id: string): Promise<CommandRecord> => {
    if (USE_MOCK) {
      const found = mockCommands.find((c) => c.id === id)
      if (!found) throw new Error('Command not found')
      return Promise.resolve(found)
    }
    return json(await fetch(`/api/commands/${encodeURIComponent(id)}`))
  },

  create: async (input: CreateCommandInput): Promise<CommandRecord> => {
    if (USE_MOCK) {
      const asset = mockAssetDef(input.asset_id)
      if (!asset) return Promise.reject(new Error('Asset not found'))
      const now = new Date()
      const requiresApproval = asset.lifeSafety
      const windowMin = requiresApproval ? LIFE_SAFETY_WINDOW_MIN : STANDARD_WINDOW_MIN
      const cmd: CommandRecord = {
        id: `cmd-mock-${++mockCounter}`,
        station_id: asset.stationId,
        asset_id: asset.id,
        action: input.action,
        payload: input.payload,
        issued_by: 'Dev Tester',
        issued_role: 'STATION_LEADER',
        issued_from: input.issued_from ?? 'station',
        requires_second_approval: requiresApproval,
        approved_by: null,
        approved_at: null,
        state: 'queued',
        expires_at: new Date(now.getTime() + windowMin * 60_000).toISOString(),
        acked_at: null,
        applied_at: null,
        created_at: now.toISOString(),
        result: null,
      }
      mockCommands.unshift(cmd)
      if (!requiresApproval) scheduleMockProgression(cmd)
      return Promise.resolve(cmd)
    }
    return json(await fetch('/api/commands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }))
  },

  // Same-approver rejection and expiry are enforced here for real (not just
  // gated in the UI) — mirrors command_engine.approve_command()'s
  // SameUserApproval/CommandExpired exceptions exactly, so a mock-mode
  // self-approval genuinely fails rather than silently succeeding.
  approve: async (id: string, approver: string, approverRole: string): Promise<CommandRecord> => {
    if (USE_MOCK) {
      const cmd = mockCommands.find((c) => c.id === id)
      if (!cmd) return Promise.reject(new Error('Command not found'))
      if (!cmd.requires_second_approval) return Promise.resolve(cmd)
      if (cmd.state !== 'queued') return Promise.reject(new Error(`Command ${cmd.id} is ${cmd.state}, cannot approve`))
      if (new Date(cmd.expires_at).getTime() < Date.now()) {
        cmd.state = 'expired'
        return Promise.reject(new Error(`Command ${cmd.id} expired at ${cmd.expires_at}`))
      }
      if (approver === cmd.issued_by) {
        return Promise.reject(new Error('A second, different authorised user must approve this command'))
      }
      cmd.approved_by = approver
      cmd.approved_at = new Date().toISOString()
      scheduleMockProgression(cmd)
      return Promise.resolve(cmd)
    }
    return json(await fetch(`/api/commands/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approver, approver_role: approverRole }),
    }))
  },

  cancel: async (id: string): Promise<CommandRecord> => {
    if (USE_MOCK) {
      const cmd = mockCommands.find((c) => c.id === id)
      if (!cmd) return Promise.reject(new Error('Command not found'))
      if (cmd.state !== 'applied' && cmd.state !== 'failed' && cmd.state !== 'expired') {
        cmd.state = 'failed'
        cmd.result = { reason: 'cancelled' }
      }
      return Promise.resolve(cmd)
    }
    return json(await fetch(`/api/commands/${encodeURIComponent(id)}/cancel`, { method: 'POST' }))
  },

  // A short, plain-language prediction of what issuing `action` will do —
  // shown in the FR-10 two-step confirmation dialog before submit.
  describeEffect: (asset: RemoteAsset, action: CommandAction, payload: Record<string, unknown>): string => {
    if (action === 'start') {
      return `${asset.name} will transition from "${asset.status}" to "running" — expect its primary reading to climb toward its nominal operating value over the next few minutes once the device acknowledges the command.`
    }
    if (action === 'stop') {
      return `${asset.name} will shut down from "${asset.status}" — its primary reading will fall toward zero (or last-known idle value) and its status will show "stopped" once applied.`
    }
    if (action === 'setpoint') {
      const field = asset.setpointField ?? 'setpoint'
      const value = payload[field]
      return `${asset.name}'s setpoint will change from ${asset.primaryValue ?? '—'}${asset.primaryUnit ?? ''} to ${value}${asset.setpointUnit ?? ''} — expect gradual convergence over the next control cycle, not an instant jump.`
    }
    const mode = payload.mode ?? '—'
    return `${asset.name} will switch operating mode to "${mode}".`
  },
}
