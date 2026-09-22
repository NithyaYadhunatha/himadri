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
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { InlineLoader, ErrorState, EmptyState } from '@/components/ui/Loader'
import { commandsService } from '@/services/commands.service'
import type { RemoteAsset, CommandAction, CommandRecord, CommandState } from '@/services/commands.service'
import type { CommandActionKind } from '@/lib/mockData/mockCommands'
import { useStationStore } from '@/store/useStationStore'
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
  asset, action, onClose, onIssued,
}: {
  asset: RemoteAsset
  action: CommandAction
  onClose: () => void
  onIssued: () => void
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
          <span className={step === 1 ? 'text-cyan' : 'text-white/30'}>1. Configure</span>
          <ArrowRight size={10} className="text-white/20" />
          <span className={step === 2 ? 'text-cyan' : 'text-white/30'}>2. Confirm &amp; Submit</span>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded border border-brand-border bg-brand-surface p-3">
                <p className="font-mono text-[9px] text-white/40 uppercase tracking-widest mb-1">Asset</p>
                <p className="text-white font-sans">{asset.name}</p>
              </div>
              <div className="rounded border border-brand-border bg-brand-surface p-3">
                <p className="font-mono text-[9px] text-white/40 uppercase tracking-widest mb-1">Current Value</p>
                <p className="text-white font-mono">{fmtValue(asset.primaryValue, asset.primaryUnit)} · <span className="text-white/50">{asset.status}</span></p>
              </div>
            </div>

            {action === 'setpoint' && (
              <div className="space-y-2">
                <label className="font-mono text-[10px] text-white/40 uppercase tracking-widest">
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
                  <p className="text-[10px] text-white/30 font-sans">Allowed range: {asset.setpointMin}–{asset.setpointMax}{asset.setpointUnit}</p>
                )}
              </div>
            )}

            {action === 'mode' && (
              <div className="space-y-2">
                <label className="font-mono text-[10px] text-white/40 uppercase tracking-widest">
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
                <p className="text-[10px] text-white/30 font-sans">Current status: <span className="text-white/50">{asset.status}</span></p>
              </div>
            )}

            {(action === 'start' || action === 'stop') && (
              <p className="text-xs text-white/50 font-sans">
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
              <div className="flex justify-between"><span className="text-white/40 font-mono uppercase text-[9px]">Asset</span><span className="text-white font-sans">{asset.name}</span></div>
              <div className="flex justify-between"><span className="text-white/40 font-mono uppercase text-[9px]">Action</span><span className="text-white font-mono">{meta.label}</span></div>
              <div className="flex justify-between"><span className="text-white/40 font-mono uppercase text-[9px]">Current Value</span><span className="text-white font-mono">{fmtValue(asset.primaryValue, asset.primaryUnit)}</span></div>
              <div className="flex justify-between">
                <span className="text-white/40 font-mono uppercase text-[9px]">Requested Value</span>
                <span className="text-cyan font-mono">
                  {action === 'setpoint' ? `${setpointValue}${asset.setpointUnit ?? ''}` : action === 'mode' ? modeValue : action === 'start' ? 'running' : action === 'stop' ? 'stopped' : '—'}
                </span>
              </div>
            </div>

            <div className="rounded border border-cyan/20 bg-cyan/5 p-3">
              <p className="font-mono text-[9px] text-cyan/70 uppercase tracking-widest mb-1.5">Predicted Effect</p>
              <p className="text-xs text-white/70 font-sans leading-relaxed">{effect}</p>
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

function AssetCard({ asset, onAction }: { asset: RemoteAsset; onAction: (asset: RemoteAsset, action: CommandAction) => void }) {
  const config = getNodeTypeConfig(asset.category)
  const Icon = config.icon
  const statusColor = asset.status === 'running' ? '#1F9E6D' : asset.status === 'stopped' ? '#6E8AA0' : '#B8720F'

  return (
    <div className="rounded border border-brand-border bg-brand-surface p-4 flex flex-col gap-3 hover:border-white/20 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded flex items-center justify-center shrink-0" style={{ background: `${config.color}18`, border: `1px solid ${config.color}30` }}>
            <Icon size={16} style={{ color: config.color }} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-sans text-white font-medium leading-tight truncate">{asset.name}</p>
            <p className="font-mono text-[9px] text-white/30 mt-0.5 uppercase tracking-wider">{config.label}{asset.subtype ? ` · ${asset.subtype}` : ''}</p>
          </div>
        </div>
        {asset.lifeSafety && (
          <Badge variant="critical" size="sm">
            <ShieldAlert size={9} /> Life-Safety
          </Badge>
        )}
      </div>

      <div className="flex items-center justify-between rounded bg-brand-bg border border-brand-border px-3 py-2">
        <span className="font-mono text-[10px] text-white/40 uppercase tracking-widest">Status</span>
        <span className="font-mono text-xs font-semibold capitalize" style={{ color: statusColor }}>{asset.status}</span>
      </div>
      <div className="flex items-center justify-between px-1">
        <span className="font-mono text-[10px] text-white/40 uppercase tracking-widest">Primary Value</span>
        <span className="font-mono text-sm text-white">{fmtValue(asset.primaryValue, asset.primaryUnit)}</span>
      </div>

      <div className="flex gap-2 pt-1">
        {asset.actions.map((action) => {
          const meta = ACTION_META[action]
          const ActionIcon = meta.icon
          return (
            <Button
              key={action}
              variant={action === 'stop' ? 'danger' : 'secondary'}
              size="sm"
              className="flex-1"
              icon={<ActionIcon size={12} />}
              onClick={() => onAction(asset, action as CommandAction)}
            >
              {meta.label}
            </Button>
          )
        })}
      </div>
    </div>
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
        <p className="font-mono text-[9px] text-white/30 truncate">{command.asset_id}</p>
      </div>
      <div className="font-mono text-white/70 capitalize">{command.action}</div>
      <div className="font-mono text-[10px] text-white/40 truncate" title={JSON.stringify(command.payload)}>
        {Object.keys(command.payload).length ? JSON.stringify(command.payload) : '{}'}
      </div>
      <div className="font-sans text-white/60 truncate">
        {command.issued_by}
        {command.requires_second_approval && <ShieldAlert size={10} className="inline ml-1 text-crimson/70" />}
      </div>
      <div><Badge variant={STATE_BADGE[command.state]} size="sm" dot={command.state === 'sent' || command.state === 'acked'}>{command.state}</Badge></div>
      <div className="font-mono text-[10px] text-white/40">{fmtTime(command.created_at)}</div>
      <div>
        {needsApproval ? (
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={approverName}
              onChange={(e) => setApproverName(e.target.value)}
              placeholder="Different approver name…"
              className="w-32 bg-brand-bg border border-brand-border rounded px-2 py-1 text-[10px] font-sans text-white placeholder:text-white/25 focus:outline-none focus:border-cyan/50"
            />
            <Button variant="primary" size="sm" disabled={!canApprove} loading={approving} onClick={handleApprove} icon={<UserCheck size={11} />}>
              Approve
            </Button>
          </div>
        ) : command.approved_by ? (
          <span className="font-mono text-[10px] text-emerald">approved by {command.approved_by}</span>
        ) : (
          <span className="font-mono text-[10px] text-white/20">—</span>
        )}
        {error && <p className="text-[9px] text-crimson mt-1">{error}</p>}
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

  const handleApprove = async (id: string, approver: string) => {
    await commandsService.approve(id, approver, 'STATION_ENGINEER')
    await refresh(false)
  }

  const categories = ASSET_CATEGORY_ORDER.filter((c) => assets.some((a) => a.category === c))
  const filteredAssets = categoryFilter ? assets.filter((a) => a.category === categoryFilter) : assets
  const assetNameById = new Map(assets.map((a) => [a.id, a.name]))
  const lifeSafetyCount = assets.filter((a) => a.lifeSafety).length

  return (
    <div className="h-[calc(100vh-3rem)] overflow-y-auto bg-brand-bg">
      <div className="px-6 py-5 max-w-[1600px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-mono text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
              <Radio size={16} className="text-cyan" />
              Remote Control — {STATION_LABELS[station]}
            </h1>
            <p className="text-white/40 text-xs mt-1 font-sans max-w-2xl leading-relaxed">
              Issue supervised setpoint/start/stop commands to controllable station assets. Life-safety assets require
              a second authorised approver.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lifeSafetyCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-crimson/10 border border-crimson/25">
                <ShieldAlert size={11} className="text-crimson" />
                <span className="font-mono text-[10px] text-crimson">{lifeSafetyCount} LIFE-SAFETY ASSET{lifeSafetyCount === 1 ? '' : 'S'}</span>
              </div>
            )}
            <Button variant="secondary" size="sm" icon={<RefreshCw size={12} />} onClick={() => refresh(true)}>
              Refresh
            </Button>
          </div>
        </div>

        {error && <ErrorState message={error} onRetry={() => refresh(true)} />}

        {/* Category filter */}
        {categories.length > 1 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setCategoryFilter('')}
              className={`px-2.5 py-1 rounded font-mono text-[10px] uppercase tracking-wider transition-colors ${categoryFilter === '' ? 'bg-cyan/10 border border-cyan/40 text-cyan' : 'text-white/40 hover:text-white border border-transparent'}`}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategoryFilter(c)}
                className={`px-2.5 py-1 rounded font-mono text-[10px] uppercase tracking-wider transition-colors ${categoryFilter === c ? 'bg-cyan/10 border border-cyan/40 text-cyan' : 'text-white/40 hover:text-white border border-transparent'}`}
              >
                {getNodeTypeConfig(c).label}
              </button>
            ))}
          </div>
        )}

        {/* Asset grid */}
        {loading ? (
          <div className="flex items-center justify-center h-32"><InlineLoader text="Loading controllable assets…" /></div>
        ) : filteredAssets.length === 0 ? (
          <EmptyState message="No controllable assets for this station" hint="Try clearing the category filter" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredAssets.map((asset) => (
              <AssetCard key={asset.id} asset={asset} onAction={(a, action) => setPending({ asset: a, action })} />
            ))}
          </div>
        )}

        {/* Command Journal */}
        <div className="rounded border border-brand-border bg-brand-surface">
          <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
            <div className="flex items-center gap-2">
              <AlertTriangle size={13} className="text-white/30" />
              <h2 className="font-mono text-xs font-semibold text-white uppercase tracking-widest">Command Journal</h2>
            </div>
            <span className="font-mono text-[10px] text-white/30">{commands.length} command{commands.length === 1 ? '' : 's'} · auto-refresh every {POLL_MS / 1000}s</span>
          </div>

          <div className="grid grid-cols-[1.6fr_0.9fr_1.2fr_1fr_0.9fr_0.9fr_2fr] gap-3 px-3 py-2 bg-brand-bg border-b border-brand-border">
            {['Asset', 'Action', 'Payload', 'Issuer', 'State', 'Created', 'Approval'].map((h) => (
              <span key={h} className="font-mono text-[9px] text-white/30 uppercase tracking-widest">{h}</span>
            ))}
          </div>

          {commands.length === 0 ? (
            <div className="py-8"><EmptyState message="No commands issued yet" hint="Issue a command from an asset card above" /></div>
          ) : (
            <div>
              {commands.map((c) => (
                <JournalRow key={c.id} command={c} assetName={assetNameById.get(c.asset_id) ?? c.asset_id} onApprove={handleApprove} />
              ))}
            </div>
          )}
        </div>
      </div>

      {pending && (
        <CommandConfirmDialog
          asset={pending.asset}
          action={pending.action}
          onClose={() => setPending(null)}
          onIssued={() => refresh(false)}
        />
      )}
    </div>
  )
}
