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
  ArrowRight, Send, UserCheck, AlertTriangle, Activity,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { InlineLoader, ErrorState, EmptyState } from '@/components/ui/Loader'
import { commandsService } from '@/services/commands.service'
import type { RemoteAsset, CommandAction, CommandRecord, CommandState } from '@/services/commands.service'
import type { CommandActionKind } from '@/lib/mockData/mockCommands'
import { useStationStore } from '@/store/useStationStore'
import { PageShell, PageHeader, Panel, SegTabs, LegendDot } from '@/components/ui/Panel'
import { MetricChart, MiniSpark, PredictedEffects, ImpactLog } from '@/components/remote/PerformancePanel'
import { usePerformanceSim } from '@/lib/performance/usePerformanceSim'
import { metricsFor, isOn, type PredictedChange, type Sample } from '@/lib/performance/assetPerformance'
import { getNodeTypeConfig, ASSET_CATEGORY_ORDER } from '@/lib/graph/nodeTypes'
import { STATION_LABELS } from '@/lib/constants'
import type { NodeType } from '@/types/graph'
import type { BadgeVariant } from '@/types/common'

const POLL_MS = 2000

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

// ─── Asset row (Task-Manager-style list entry) ─────────────────────────────

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
      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left border-l-[3px] transition-colors ${
        selected ? 'bg-cyan/10 border-cyan' : 'border-transparent hover:bg-brand-surface-2'
      }`}
    >
      <div className="w-8 h-8 rounded flex items-center justify-center shrink-0" style={{ background: `${config.color}1a`, border: `1px solid ${config.color}40` }}>
        <Icon size={15} style={{ color: config.color }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-sans text-sm text-white font-medium leading-tight truncate">{asset.name}</p>
        <p className="font-mono text-[11px] text-white/70 mt-0.5 flex items-center gap-1.5">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${on ? 'bg-emerald' : 'bg-white/40'}`} />
          {asset.status}{asset.lifeSafety ? ' · life-safety' : ''}
        </p>
      </div>
      <div className="flex flex-col items-end shrink-0">
        {samples.length > 3 && <MiniSpark samples={samples} def={def} color={on ? def.color : '#6E8AA0'} />}
        <span className="font-mono text-[11px] text-white/80">{last !== undefined ? `${last.toFixed(def.decimals ?? 0)} ${def.unit}` : '—'}</span>
      </div>
    </button>
  )
}

// ─── Command Journal row ────────────────────────────────────────────────────

function JournalRow({
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
  const canApprove = trimmed.length > 1 && trimmed.toLowerCase() !== command.issued_by.trim().toLowerCase()

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
    <div className="grid grid-cols-[1.6fr_0.9fr_1.2fr_1fr_0.9fr_0.9fr_2fr] gap-3 px-3 py-2.5 items-center border-b border-brand-border/60 text-xs">
      <div className="min-w-0">
        <p className="text-white font-sans truncate">{assetName}</p>
        <p className="font-mono text-[10px] text-white/55 truncate">{command.asset_id}</p>
      </div>
      <div className="font-mono text-white/70 capitalize">{command.action}</div>
      <div className="font-mono text-[10px] text-white/62 truncate" title={JSON.stringify(command.payload)}>
        {Object.keys(command.payload).length ? JSON.stringify(command.payload) : '{}'}
      </div>
      <div className="font-sans text-white/75 truncate">
        {command.issued_by}
        {command.requires_second_approval && <ShieldAlert size={10} className="inline ml-1 text-crimson/70" />}
      </div>
      <div><Badge variant={STATE_BADGE[command.state]} size="sm" dot={command.state === 'sent' || command.state === 'acked'}>{command.state}</Badge></div>
      <div className="font-mono text-[10px] text-white/62">{fmtTime(command.created_at)}</div>
      <div>
        {needsApproval ? (
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={approverName}
              onChange={(e) => setApproverName(e.target.value)}
              placeholder="Different approver name…"
              className="w-32 bg-brand-bg border border-brand-border rounded px-2 py-1 text-[10px] font-sans text-white placeholder:text-white/50 focus:outline-none focus:border-cyan/50"
            />
            <Button variant="primary" size="sm" disabled={!canApprove} loading={approving} onClick={handleApprove} icon={<UserCheck size={11} />}>
              Approve
            </Button>
          </div>
        ) : command.approved_by ? (
          <span className="font-mono text-[10px] text-emerald">approved by {command.approved_by}</span>
        ) : (
          <span className="font-mono text-[10px] text-white/50">—</span>
        )}
        {error && <p className="text-[10px] text-crimson mt-1">{error}</p>}
      </div>
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

  useEffect(() => { refresh(true); setSelectedId(null) }, [refresh])

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
  const selected = assets.find((a) => a.id === selectedId) ?? filteredAssets[0] ?? null
  const defs = selected ? metricsFor(selected.category) : []
  const samples = selected ? sim.history.get(selected.id) ?? [] : []
  const markers = selected ? sim.impacts.filter((e) => e.assetId === selected.id).map((e) => e.t0) : []
  const ctx = sim.ctx
  const supplyPct = ctx ? Math.round(ctx.supply * 100) : 100
  const now = Date.now()

  return (
    <PageShell width="max-w-[1600px]">
      <PageHeader
        icon={<Radio size={20} />}
        eyebrow="Station Twin"
        title={`Remote Control — ${STATION_LABELS[station]}`}
        subtitle="Pick an asset to watch its live performance, then issue supervised commands. Every action shows the performance it is predicted to cause — and, once applied, what it actually did to this asset and to the rest of the station. Life-safety assets need a second approver."
        actions={
          <>
            {lifeSafetyCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-crimson/10 border border-crimson/30">
                <ShieldAlert size={12} className="text-crimson" />
                <span className="font-mono text-[11px] text-crimson font-bold">{lifeSafetyCount} LIFE-SAFETY ASSET{lifeSafetyCount === 1 ? '' : 'S'}</span>
              </div>
            )}
            <Button variant="secondary" size="sm" icon={<RefreshCw size={12} />} onClick={() => refresh(true)}>Refresh</Button>
          </>
        }
      />

      {error && <ErrorState message={error} onRetry={() => refresh(true)} />}

      {ctx && ctx.runningGens === 0 && assets.some((a) => a.category === 'power') && (
        <div className="flex items-start gap-2.5 rounded-md bg-crimson/10 border border-crimson/40 px-4 py-3">
          <AlertTriangle size={16} className="text-crimson shrink-0 mt-0.5" />
          <p className="font-sans text-sm text-crimson font-medium">No generator is running — the station electrical load is unserved and every powered asset is browning out.</p>
        </div>
      )}
      {ctx && ctx.runningGens > 0 && supplyPct < 100 && (
        <div className="flex items-start gap-2.5 rounded-md bg-amber/10 border border-amber/40 px-4 py-3">
          <AlertTriangle size={16} className="text-amber shrink-0 mt-0.5" />
          <p className="font-sans text-sm text-white">Running generators cover only <span className="font-bold text-amber">{supplyPct}%</span> of station demand — heating, water and waste plants are derated until more capacity is online.</p>
        </div>
      )}

      {categories.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['', ...categories] as Array<NodeType | ''>).map((c) => (
            <button
              key={c || 'all'}
              onClick={() => setCategoryFilter(c)}
              className={`px-3 py-1.5 rounded-md font-mono text-[11px] uppercase tracking-wider transition-colors border ${
                categoryFilter === c ? 'bg-cyan text-brand-bg border-cyan font-bold' : 'bg-brand-surface text-white/75 border-brand-border hover:text-white hover:border-cyan/50'
              }`}
            >
              {c === '' ? 'All' : getNodeTypeConfig(c).label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32"><InlineLoader text="Loading controllable assets…" /></div>
      ) : filteredAssets.length === 0 || !selected ? (
        <EmptyState message="No controllable assets for this station" hint="Try clearing the category filter" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-4 items-start">
          {/* asset list */}
          <Panel bodyClassName="!px-0 !pb-1" title="Assets" subtitle="Live, last 60 s">
            <div className="divide-y divide-brand-border border-t border-brand-border max-h-[640px] overflow-y-auto">
              {filteredAssets.map((a) => (
                <AssetRow key={a.id} asset={a} selected={a.id === selected.id} samples={sim.history.get(a.id) ?? []} onSelect={() => setSelectedId(a.id)} />
              ))}
            </div>
          </Panel>

          {/* detail */}
          <div className="space-y-4 min-w-0">
            <Panel accent={getNodeTypeConfig(selected.category).color}>
              <div className="flex items-start justify-between gap-3 flex-wrap pt-1">
                <div className="min-w-0">
                  <h2 className="font-sans text-lg font-semibold text-white leading-tight flex items-center gap-2 flex-wrap">
                    {selected.name}
                    {selected.lifeSafety && <Badge variant="critical" size="sm"><ShieldAlert size={10} /> Life-safety</Badge>}
                  </h2>
                  <p className="font-mono text-xs text-white/70 mt-1 uppercase tracking-wider">
                    {getNodeTypeConfig(selected.category).label}{selected.subtype ? ` · ${selected.subtype}` : ''} · status <span className={isOn(selected) ? 'text-emerald font-bold' : 'text-white font-bold'}>{selected.status}</span>
                    {selected.primaryValue !== null && <> · setting {fmtValue(selected.primaryValue, selected.primaryUnit)}</>}
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {selected.actions.map((action) => {
                    const meta = ACTION_META[action]
                    const ActionIcon = meta.icon
                    return (
                      <Button key={action} variant={action === 'stop' ? 'danger' : 'secondary'} size="md" icon={<ActionIcon size={14} />}
                        onClick={() => setPending({ asset: selected, action: action as CommandAction })}>
                        {meta.label}
                      </Button>
                    )
                  })}
                </div>
              </div>
            </Panel>

            <Panel
              title="Performance" icon={<Activity size={14} />}
              subtitle="Simulated telemetry derived from the asset's commanded state and the rest of the station — not live sensor data."
              actions={<SegTabs size="sm" value={windowSec} onChange={setWindowSec} options={[{ value: '60', label: '60 s' }, { value: '120', label: '2 min' }]} />}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {defs.map((d) => <MetricChart key={d.key + selected.id} def={d} samples={samples} windowSec={Number(windowSec)} markers={markers} />)}
              </div>
              <div className="mt-3 flex items-center gap-4 flex-wrap">
                <LegendDot color="#16283A" label="command applied" dashed />
                <span className="font-sans text-[11px] text-white/62">Charts refresh every second. Stop or start something and watch this asset — and its neighbours — respond.</span>
              </div>
            </Panel>

            <Panel title="How actions affected performance" icon={<Activity size={14} />}
              subtitle={`Averages before the command vs ~30 s after it was applied — ${selected.name} first, then anything else on the station that moved.`}>
              <ImpactLog impacts={sim.impacts} assetId={selected.id} now={now} />
            </Panel>
          </div>
        </div>
      )}

      {/* Command Journal */}
      <Panel
        title="Command journal" icon={<AlertTriangle size={14} />}
        subtitle={`${commands.length} command${commands.length === 1 ? '' : 's'} · auto-refresh every ${POLL_MS / 1000}s`}
        bodyClassName="!px-0 !pb-0"
      >
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[1.6fr_0.9fr_1.2fr_1fr_0.9fr_0.9fr_2fr] gap-3 px-4 py-2 bg-brand-surface-2 border-y border-brand-border">
              {['Asset', 'Action', 'Payload', 'Issuer', 'State', 'Created', 'Approval'].map((h) => (
                <span key={h} className="font-mono text-[11px] text-white/70 uppercase tracking-widest font-semibold">{h}</span>
              ))}
            </div>
            {commands.length === 0 ? (
              <div className="py-8"><EmptyState message="No commands issued yet" hint="Pick an asset above and issue a command" /></div>
            ) : (
              commands.map((c) => (
                <JournalRow key={c.id} command={c} assetName={assetNameById.get(c.asset_id) ?? c.asset_id} onApprove={handleApprove} />
              ))
            )}
          </div>
        </div>
      </Panel>

      {pending && (
        <CommandConfirmDialog
          asset={pending.asset}
          action={pending.action}
          onClose={() => setPending(null)}
          onIssued={() => refresh(false)}
          predict={sim.predict}
        />
      )}
    </PageShell>
  )
}
