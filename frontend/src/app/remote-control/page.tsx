'use client'

// src/app/remote-control/page.tsx
//
// Remote Control (FR-9…14, C4) — the actual point of PS 26060 ("efficient
// REMOTE MANAGEMENT of Indian Antarctic Research Stations"). Surfaces the
// two-phase command state machine (backend/services/command_engine.py) that
// already existed server-side but had no prominent UI: issue a supervised
// setpoint/start/stop/mode command against a controllable asset, watch it
// walk queued -> sent -> acked -> applied in the Command Journal below, and
// — for a life_safety asset — require a second, different authorised user
// to approve it first (FR-11).
//
// FR-10's two-step confirmation (show asset, current value, requested
// value, and predicted effect before submitting) lives in
// CommandConfirmDialog below, not skipped for convenience.

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Radio, Play, Square, SlidersHorizontal, ShieldAlert, RefreshCw,
  ArrowRight, Send, UserCheck, AlertTriangle,
} from 'lucide-react'
import { Kpi, Panel, PageHead, Pill, Skeleton, type Tone } from '@/components/ui/kit'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { InlineLoader, ErrorState, EmptyState } from '@/components/ui/Loader'
import { commandsService } from '@/services/commands.service'
import type { RemoteAsset, CommandAction, CommandRecord, CommandState } from '@/services/commands.service'
import type { CommandActionKind } from '@/lib/mockData/mockCommands'
import { useStationStore } from '@/store/useStationStore'
import { SegTabs, LegendDot } from '@/components/ui/Panel'
import { MetricChart, MiniSpark, PredictedEffects, ImpactLog } from '@/components/remote/PerformancePanel'
import { usePerformanceSim } from '@/lib/performance/usePerformanceSim'
import { metricsFor, isOn, type PredictedChange, type Sample } from '@/lib/performance/assetPerformance'
import { getNodeTypeConfig, ASSET_CATEGORY_ORDER } from '@/lib/graph/nodeTypes'
import { STATION_LABELS } from '@/lib/constants'
import type { NodeType } from '@/types/graph'
import type { BadgeVariant } from '@/types/common'

const POLL_MS = 3000

const ACTION_META: Record<CommandActionKind, { label: string; icon: React.ElementType }> = {
  start: { label: 'Start', icon: Play },
  stop: { label: 'Stop', icon: Square },
  setpoint: { label: 'Setpoint', icon: SlidersHorizontal },
  mode: { label: 'Mode', icon: Radio },
}

const STATE_BADGE: Record<CommandState, BadgeVariant> = {
  queued: 'neutral',
  sent: 'info',
  acked: 'warning',
  applied: 'healthy',
  failed: 'critical',
  expired: 'critical',
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function fmtValue(v: number | null, unit: string | null): string {
  if (v === null) return '—'
  return `${Number.isInteger(v) ? v : v.toFixed(1)}${unit ? ` ${unit}` : ''}`
}

// ─── Two-step confirmation dialog (FR-10) ──────────────────────────────────

function CommandConfirmDialog({
  asset, action, onClose, onIssued, predict,
}: {
  asset: RemoteAsset
  action: CommandAction
  onClose: () => void
  onIssued: () => void
  predict: (asset: RemoteAsset, action: string, payload: Record<string, unknown>) => PredictedChange[]
}) {
  const [step, setStep] = useState<1 | 2>(1)
  const [setpointValue, setSetpointValue] = useState<number>(asset.primaryValue ?? 0)
  const [modeValue, setModeValue] = useState<string>(asset.modeOptions?.[0] ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const payload: Record<string, unknown> =
    action === 'setpoint' ? { [asset.setpointField ?? 'setpoint_c']: setpointValue }
    : action === 'mode' ? { mode: modeValue }
    : {}

  const effect = commandsService.describeEffect(asset, action, payload)
  const meta = ACTION_META[action as CommandActionKind]

  const handleSubmit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await commandsService.create({ asset_id: asset.id, action, payload, issued_from: 'station' })
      onIssued()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to issue command')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onClose={onClose} title={`${meta.label} — ${asset.name}`} width="max-w-lg">
      <div className="p-5 space-y-4">
        {asset.lifeSafety && (
          <div className="flex items-start gap-2.5 rounded p-3 bg-crimson/10 border border-crimson/30">
            <ShieldAlert size={16} className="text-crimson shrink-0 mt-0.5" />
            <p className="text-xs font-sans text-crimson/90 leading-relaxed">
              This is a <span className="font-semibold">life-safety asset</span>. Per FR-11, this command will sit in
              <span className="font-mono"> queued </span> until a second, different authorised user approves it — the
              same person who issues it can never approve it.
            </p>
          </div>
        )}

        {/* Step indicator */}
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest">
          <span className={step === 1 ? 'text-cyan' : 'text-white/55'}>1. Configure</span>
          <ArrowRight size={10} className="text-white/50" />
          <span className={step === 2 ? 'text-cyan' : 'text-white/55'}>2. Confirm &amp; Submit</span>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded border border-brand-border bg-brand-surface p-3">
                <p className="font-mono text-[10px] text-white/62 uppercase tracking-widest mb-1">Asset</p>
                <p className="text-white font-sans">{asset.name}</p>
              </div>
              <div className="rounded border border-brand-border bg-brand-surface p-3">
                <p className="font-mono text-[10px] text-white/62 uppercase tracking-widest mb-1">Current Value</p>
                <p className="text-white font-mono">{fmtValue(asset.primaryValue, asset.primaryUnit)} · <span className="text-white/70">{asset.status}</span></p>
              </div>
            </div>

            {action === 'setpoint' && (
              <div className="space-y-2">
                <label className="font-mono text-[10px] text-white/62 uppercase tracking-widest">
                  Requested Setpoint ({asset.setpointUnit})
                </label>
                <input
                  type="number"
                  value={setpointValue}
                  min={asset.setpointMin}
                  max={asset.setpointMax}
                  step={0.5}
                  onChange={(e) => setSetpointValue(parseFloat(e.target.value))}
                  className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-cyan/50"
                />
                {asset.setpointMin !== undefined && asset.setpointMax !== undefined && (
                  <p className="text-[10px] text-white/55 font-sans">Allowed range: {asset.setpointMin}–{asset.setpointMax}{asset.setpointUnit}</p>
                )}
              </div>
            )}

            {action === 'mode' && (
              <div className="space-y-2">
                <label className="font-mono text-[10px] text-white/62 uppercase tracking-widest">
                  Requested Operating Mode
                </label>
                <select
                  value={modeValue}
                  onChange={(e) => setModeValue(e.target.value)}
                  className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-cyan/50"
                >
                  {(asset.modeOptions ?? []).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <p className="text-[10px] text-white/55 font-sans">Current status: <span className="text-white/70">{asset.status}</span></p>
              </div>
            )}

            {(action === 'start' || action === 'stop') && (
              <p className="text-xs text-white/70 font-sans">
                No additional parameters — this action carries an empty payload.
              </p>
            )}

            <div className="flex justify-end">
              <Button variant="primary" size="sm" onClick={() => setStep(2)} disabled={action === 'mode' && !modeValue} icon={<ArrowRight size={12} />}>
                Review
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="rounded border border-brand-border bg-brand-surface p-3 space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-white/62 font-mono uppercase text-[10px]">Asset</span><span className="text-white font-sans">{asset.name}</span></div>
              <div className="flex justify-between"><span className="text-white/62 font-mono uppercase text-[10px]">Action</span><span className="text-white font-mono">{meta.label}</span></div>
              <div className="flex justify-between"><span className="text-white/62 font-mono uppercase text-[10px]">Current Value</span><span className="text-white font-mono">{fmtValue(asset.primaryValue, asset.primaryUnit)}</span></div>
              <div className="flex justify-between">
                <span className="text-white/62 font-mono uppercase text-[10px]">Requested Value</span>
                <span className="text-cyan font-mono">
                  {action === 'setpoint' ? `${setpointValue}${asset.setpointUnit ?? ''}` : action === 'mode' ? modeValue : action === 'start' ? 'running' : action === 'stop' ? 'stopped' : '—'}
                </span>
              </div>
            </div>

            <div className="rounded border border-cyan/20 bg-cyan/5 p-3">
              <p className="font-mono text-[11px] text-cyan uppercase tracking-widest mb-1.5">Predicted effect</p>
              <p className="text-xs text-white/80 font-sans leading-relaxed">{effect}</p>
              <p className="font-mono text-[11px] text-white/70 uppercase tracking-wider mt-3 mb-1.5">Performance once settled (now → after)</p>
              <PredictedEffects rows={predict(asset, action, payload)} />
            </div>

            {error && <ErrorState message={error} />}

            <div className="flex justify-between items-center">
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}>Back</Button>
              <Button variant="primary" size="sm" loading={submitting} onClick={handleSubmit} icon={<Send size={12} />}>
                Issue Command
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}

// ─── Asset card ─────────────────────────────────────────────────────────────

function AssetRow({ asset, selected, samples, onSelect }: { asset: RemoteAsset; selected: boolean; samples: Sample[]; onSelect: () => void }) {
  const config = getNodeTypeConfig(asset.category)
  const Icon = config.icon
  const def = metricsFor(asset.category)[0]
  const on = isOn(asset)
  const last = samples[samples.length - 1]?.[def.key]
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left border-l-[3px] transition-colors ${selected ? 'bg-cyan/10 border-cyan' : 'border-transparent hover:bg-brand-surface-2/70'}`}
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${config.color}16` }}>
        <Icon size={16} style={{ color: config.color }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] text-white font-medium leading-tight truncate">{asset.name}</p>
        <p className="font-mono text-[10.5px] text-white/65 mt-0.5 flex items-center gap-1.5">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${on ? 'bg-emerald' : 'bg-white/40'}`} />
          {asset.status}{asset.lifeSafety ? ' · 2-person' : ''}
        </p>
      </div>
      <div className="flex flex-col items-end shrink-0">
        {samples.length > 3 && <MiniSpark samples={samples} def={def} color={on ? def.color : '#626079'} />}
        <span className="font-mono text-[10.5px] text-white/75">{last !== undefined ? `${last.toFixed(def.decimals ?? 0)} ${def.unit}` : '—'}</span>
      </div>
    </button>
  )
}

// ─── Command lifecycle card ─────────────────────────────────────────────────

const STAGES: { id: string; label: string }[] = [
  { id: 'queued', label: 'Queued' },
  { id: 'approved', label: 'Co-approved' },
  { id: 'sent', label: 'Sent' },
  { id: 'acked', label: 'Acked' },
  { id: 'applied', label: 'Applied' },
]

function stageIndex(c: CommandRecord): number {
  if (c.state === 'applied') return 4
  if (c.state === 'acked') return 3
  if (c.state === 'sent') return 2
  if (c.requires_second_approval && c.approved_at) return 1
  return c.state === 'queued' ? 0 : 2
}

function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const end = new Date(/Z$|[+-]\d\d:\d\d$/.test(to) ? to : to + 'Z').getTime()
  const s = Math.max(0, Math.round((end - now) / 1000))
  return <span className={`num ${s < 120 ? 'text-crimson' : 'text-amber'}`}>{`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`}</span>
}

function JournalCard({
  command, assetName, onApprove,
}: {
  command: CommandRecord
  assetName: string
  onApprove: (id: string, approver: string) => Promise<void>
}) {
  const [approverName, setApproverName] = useState('')
  const [approving, setApproving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const needsApproval = command.state === 'queued' && command.requires_second_approval && !command.approved_at
  const trimmed = approverName.trim()
  const sameUser = trimmed.length > 0 && trimmed.toLowerCase() === command.issued_by.trim().toLowerCase()
  const canApprove = trimmed.length > 1 && !sameUser
  const failed = command.state === 'failed' || command.state === 'expired'
  const idx = stageIndex(command)

  const handleApprove = async () => {
    setApproving(true)
    setError(null)
    try {
      await onApprove(command.id, trimmed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed')
    } finally {
      setApproving(false)
    }
  }

  return (
    <div className="px-5 py-4 border-b border-brand-border/70 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[12.5px] text-white">
            <b>{command.action.toUpperCase()}</b> · {assetName}
            {Object.keys(command.payload).length > 0 && <span className="text-white/65"> {JSON.stringify(command.payload)}</span>}
          </p>
          <p className="font-mono text-[10.5px] text-white/65 mt-0.5">
            issued by <b className="text-white/75">{command.issued_by}</b> ({command.issued_role}) · {fmtTime(command.created_at)}
            {command.approved_by && <> · co-approved by <b className="text-emerald">{command.approved_by}</b></>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {command.requires_second_approval ? <Pill tone="warn"><ShieldAlert size={10} /> needs 2nd approver</Pill> : <Pill tone="mute">single approver class</Pill>}
          <Pill tone={failed ? 'crit' : command.state === 'applied' ? 'ok' : 'primary'} dot={command.state === 'sent' || command.state === 'acked'}>{command.state}</Pill>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-1.5 mt-3">
        {STAGES.map((s, i) => (
          <div key={s.id}>
            <div className={`h-1.5 rounded-full ${failed ? 'bg-crimson/30' : i <= idx ? 'bg-cyan' : 'bg-brand-surface-3'}`} />
            <p className={`font-mono text-[10px] uppercase tracking-wider mt-1 ${i <= idx && !failed ? 'text-white/70' : 'text-white/55'}`}>{s.label}</p>
          </div>
        ))}
      </div>

      {needsApproval && (
        <div className="mt-4 rounded-xl border-2 border-amber/40 bg-amber/5 p-4 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[220px]">
            <p className="font-display text-[17px] text-white">Waiting for a second person.</p>
            <p className="font-mono text-[10.5px] text-white/55 mt-0.5">
              The issuer can never approve their own command. Window closes in <Countdown to={command.expires_at} />.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={approverName}
              onChange={(e) => setApproverName(e.target.value)}
              placeholder="Second approver's name…"
              className={`w-52 rounded-lg border px-3 py-2 text-[12px] bg-brand-surface text-white placeholder:text-white/55 focus:outline-none ${sameUser ? 'border-crimson focus:border-crimson' : 'border-brand-border focus:border-cyan'}`}
            />
            <button
              disabled={!canApprove || approving}
              onClick={handleApprove}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white text-brand-surface px-4 py-2 font-mono text-[10.5px] uppercase tracking-wider disabled:opacity-35 hover:opacity-90"
            >
              <UserCheck size={12} /> {approving ? 'Approving…' : 'Co-approve'}
            </button>
          </div>
          {sameUser && <p className="w-full font-mono text-[10.5px] text-crimson">Refused: the approver must be a different person than the issuer ({command.issued_by}).</p>}
          {error && <p className="w-full font-mono text-[10.5px] text-crimson">{error}</p>}
        </div>
      )}
    </div>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function RemoteControlPage() {
  const station = useStationStore((s) => s.station)
  const [assets, setAssets] = useState<RemoteAsset[]>([])
  const [commands, setCommands] = useState<CommandRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<NodeType | ''>('')
  const [pending, setPending] = useState<{ asset: RemoteAsset; action: CommandAction } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [windowSec, setWindowSec] = useState<'60' | '120'>('60')

  const isMounted = useRef(true)
  useEffect(() => {
    isMounted.current = true
    return () => { isMounted.current = false }
  }, [])

  const refresh = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true)
    try {
      const [assetList, commandList] = await Promise.all([
        commandsService.listControllableAssets(station),
        commandsService.list(station),
      ])
      if (isMounted.current) {
        setAssets(assetList)
        setCommands(commandList)
        setError(null)
      }
    } catch (err) {
      if (isMounted.current) setError(err instanceof Error ? err.message : 'Failed to load remote control data')
    } finally {
      if (showLoader && isMounted.current) setLoading(false)
    }
  }, [station])

  useEffect(() => { refresh(true) }, [refresh])

  useEffect(() => {
    const id = setInterval(() => refresh(false), POLL_MS)
    return () => clearInterval(id)
  }, [refresh])

  const sim = usePerformanceSim(assets, commands)

  const handleApprove = async (id: string, approver: string) => {
    await commandsService.approve(id, approver, 'STATION_ENGINEER')
    await refresh(false)
  }

  const categories = ASSET_CATEGORY_ORDER.filter((c) => assets.some((a) => a.category === c))
  const filteredAssets = categoryFilter ? assets.filter((a) => a.category === categoryFilter) : assets
  const assetNameById = new Map(assets.map((a) => [a.id, a.name]))
  const lifeSafetyCount = assets.filter((a) => a.lifeSafety).length
  const awaiting = commands.filter((c) => c.state === 'queued' && c.requires_second_approval && !c.approved_at).length
  const selected = assets.find((a) => a.id === selectedId) ?? filteredAssets[0] ?? null
  const defs = selected ? metricsFor(selected.category) : []
  const samples = selected ? sim.history.get(selected.id) ?? [] : []
  const markers = selected ? sim.impacts.filter((e) => e.assetId === selected.id).map((e) => e.t0) : []
  const inFlight = commands.filter((c) => ['queued', 'sent', 'acked'].includes(c.state)).length

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1500px] mx-auto px-6 py-7">
        <PageHead
          eyebrow={`Remote control · ${STATION_LABELS[station]}`}
          title="Act from 11,000 km away — never alone."
          sub="Supervised start / stop / setpoint commands to controllable assets. Life-safety assets need a second, different authorised person inside 15 minutes; the backend enforces it and chains every step into the audit ledger."
          right={
            <button onClick={() => refresh(true)} className="inline-flex items-center gap-2 rounded-lg border border-brand-border bg-brand-surface px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-white/70 hover:text-cyan hover:border-cyan transition">
              <RefreshCw size={12} /> Refresh
            </button>
          }
        />

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 stagger">
          <Kpi label="Controllable assets" value={loading ? null : assets.length} tone="primary" icon={<Radio size={15} />} hint="start · stop · setpoint · mode" />
          <Kpi label="Life-safety (2-person)" value={loading ? null : lifeSafetyCount} tone="crit" icon={<ShieldAlert size={15} />} hint="second approver required" />
          <Kpi label="Awaiting co-approval" value={awaiting} tone={awaiting ? 'warn' : 'ok'} icon={<UserCheck size={15} />} hint="15-minute window then expiry" />
          <Kpi label="Commands in flight" value={inFlight} tone="ink" icon={<Send size={15} />} hint="queued → sent → acked → applied" />
        </div>

        {error && <div className="mt-4"><ErrorState message={error} onRetry={() => refresh(true)} /></div>}

        <div className="flex items-center gap-2 flex-wrap mt-6">
          <button onClick={() => setCategoryFilter('')} className={`rounded-full border px-3.5 py-1.5 font-mono text-[10.5px] uppercase tracking-wider transition ${categoryFilter === '' ? 'bg-white text-brand-surface border-white' : 'border-brand-border bg-brand-surface text-white/75 hover:text-white'}`}>
            All
          </button>
          {categories.map((c) => (
            <button key={c} onClick={() => setCategoryFilter(c)} className={`rounded-full border px-3.5 py-1.5 font-mono text-[10.5px] uppercase tracking-wider transition ${categoryFilter === c ? 'bg-white text-brand-surface border-white' : 'border-brand-border bg-brand-surface text-white/75 hover:text-white'}`}>
              {getNodeTypeConfig(c).label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid lg:grid-cols-[340px_1fr] gap-5 mt-5">
            <Skeleton className="h-96" />
            <Skeleton className="h-96" />
          </div>
        ) : filteredAssets.length === 0 || !selected ? (
          <div className="mt-5"><EmptyState message="No controllable assets for this station" hint="Try clearing the category filter" /></div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-5 mt-5 items-start">
            <Panel pad={false} eyebrow="Live · last 60 s" title="Assets">
              <div className="divide-y divide-brand-border/70 max-h-[680px] overflow-y-auto">
                {filteredAssets.map((a) => (
                  <AssetRow key={a.id} asset={a} selected={a.id === selected.id} samples={sim.history.get(a.id) ?? []} onSelect={() => setSelectedId(a.id)} />
                ))}
              </div>
            </Panel>

            <div className="space-y-5 min-w-0">
              <div className="panel p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="eyebrow">{getNodeTypeConfig(selected.category).label}{selected.subtype ? ` · ${selected.subtype}` : ''}</p>
                    <h2 className="font-display text-[28px] leading-tight text-white mt-1 flex items-center gap-3 flex-wrap">
                      {selected.name}
                      {selected.lifeSafety && <Pill tone="crit"><ShieldAlert size={10} /> 2-person</Pill>}
                    </h2>
                    <p className="font-mono text-[11px] text-white/65 mt-1.5 uppercase tracking-wider">
                      status <b className={isOn(selected) ? 'text-emerald' : 'text-white'}>{selected.status}</b>
                      {selected.primaryValue !== null && <> · setting <b className="text-white">{fmtValue(selected.primaryValue, selected.primaryUnit)}</b></>}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {selected.actions.map((action) => {
                      const meta = ACTION_META[action]
                      const ActionIcon = meta.icon
                      const danger = action === 'stop'
                      return (
                        <button key={action} onClick={() => setPending({ asset: selected, action: action as CommandAction })}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-4 py-2.5 font-mono text-[11px] uppercase tracking-wider transition ${danger ? 'border-crimson/50 text-crimson hover:bg-crimson/10' : 'border-brand-border bg-brand-surface text-white/80 hover:border-cyan hover:text-white'}`}>
                          <ActionIcon size={13} /> {meta.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              <Panel eyebrow="Task-manager view" title="Performance"
                right={<SegTabs size="sm" value={windowSec} onChange={setWindowSec} options={[{ value: '60', label: '60 s' }, { value: '120', label: '2 min' }]} />}>
                <p className="text-[12.5px] text-white/65 mb-3 leading-relaxed">Simulated telemetry derived from the asset&apos;s commanded state and the rest of the station — not live sensor data.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {defs.map((d) => <MetricChart key={d.key + selected.id} def={d} samples={samples} windowSec={Number(windowSec)} markers={markers} />)}
                </div>
                <div className="mt-3 flex items-center gap-4 flex-wrap">
                  <LegendDot color="#080330" label="command applied" dashed />
                  <span className="text-[11.5px] text-white/75">Refreshes every second. Stop or start something and watch this asset — and its neighbours — respond.</span>
                </div>
              </Panel>

              <Panel eyebrow="Cause and effect" title="How actions affected performance">
                <p className="text-[12.5px] text-white/65 mb-3 leading-relaxed">Averages before the command vs ~30 s after it was applied — {selected.name} first, then anything else on the station that moved.</p>
                <ImpactLog impacts={sim.impacts} assetId={selected.id} now={Date.now()} />
              </Panel>
            </div>
          </div>
        )}

        <Panel className="mt-7" pad={false} eyebrow="Audited & tamper-evident" title="Command journal" right={<span className="font-mono text-[10.5px] text-white/65">{commands.length} command{commands.length === 1 ? '' : 's'} · live every {POLL_MS / 1000}s</span>}>
          {commands.length === 0 ? (
            <div className="py-8"><EmptyState message="No commands issued yet" hint="Issue a command from an asset card above" /></div>
          ) : (
            <div>
              {commands.map((c) => (
                <JournalCard key={c.id} command={c} assetName={assetNameById.get(c.asset_id) ?? c.asset_id} onApprove={handleApprove} />
              ))}
            </div>
          )}
        </Panel>
      </div>

      {pending && (
        <CommandConfirmDialog
          asset={pending.asset}
          action={pending.action}
          onClose={() => setPending(null)}
          onIssued={() => refresh(false)}
          predict={sim.predict}
        />
      )}
    </div>
  )
}
