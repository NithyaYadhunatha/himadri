// src/components/graph/NodeInspector.tsx
'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Activity, Clock, AlertTriangle, Link2, Server, RefreshCw, KeyRound, ScrollText, Trash2, Zap, QrCode } from 'lucide-react'
import { ROUTES } from '@/lib/constants'
import { CenteredModal } from '@/components/ui/CenteredModal'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { CopyField } from '@/components/ui/CopyField'
import { HealthGauge } from '@/components/ui/HealthGauge'
import { Sparkline } from '@/components/ui/Sparkline'
import { nodeHealthService } from '@/services/nodeHealth.service'
import { remediationService } from '@/services/remediation.service'
import { nodeAdminService } from '@/services/nodeAdmin.service'
import type { GraphNode } from '@/types/graph'
import type { NodeHealth, RemediationAction } from '@/types/nodes'
import type { BadgeVariant } from '@/types/common'
import { HEALTH_COLORS } from '@/lib/constants'
import { getNodeTypeConfig } from '@/lib/graph/nodeTypes'
import { computeWeightedRisk, weightedRiskColor } from '@/lib/graph/riskWeighting'
import { getNodeTypePanel } from '@/components/graph/panels'
import { NodeActionsSection } from '@/components/graph/panels/NodeActionsSection'
import { NodeLogsModal } from '@/components/nodes/NodeLogsModal'

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  return `${days}d ${hours}h`
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

const healthBadgeVariant: Record<string, BadgeVariant> = {
  healthy: 'healthy',
  degraded: 'warning',
  critical: 'critical',
  unreachable: 'neutral',
}

interface NodeInspectorProps {
  node: GraphNode | null
  open: boolean
  onClose: () => void
  /** All nodes on the current graph — passed through to type-specific panels for cross-node lookups. */
  allNodes?: GraphNode[]
  /** Jump the inspector to a different node (e.g. clicking a hosted VM from a Virtualization Host panel). */
  onSelectNode?: (nodeId: string) => void
  /** Called after a node is permanently removed. */
  onRemoved?: (nodeId: string) => void
  /** Node deletion is restricted to administrators. */
  canRemove?: boolean
  /** Render inside a page rail, without a backdrop or popup. */
  embedded?: boolean
}

export function NodeInspector({ node, open, onClose, allNodes = [], onSelectNode, onRemoved, canRemove = false, embedded = false }: NodeInspectorProps) {
  const [detail, setDetail] = useState<NodeHealth | null>(null)
  const [logsOpen, setLogsOpen] = useState(false)
  const [actions, setActions] = useState<RemediationAction[]>([])
  const [error, setError] = useState<string | null>(null)
  const [executingId, setExecutingId] = useState<string | null>(null)
  const [executeResult, setExecuteResult] = useState<{ id: string; ok: boolean; message: string } | null>(null)
  const executeResultTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [credentials, setCredentials] = useState<{ node_id: string; api_key: string } | null>(null)
  const [credentialsLoading, setCredentialsLoading] = useState(false)
  const [credentialsError, setCredentialsError] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!node) return
    setError(null)
    try {
      const [nodeDetail, nodeActions] = await Promise.all([
        nodeHealthService.getNode(node.id),
        nodeHealthService.getRemediationActions(node.id),
      ])
      setDetail(nodeDetail)
      setActions(nodeActions)
    } catch {
      setError('Failed to load node details')
    }
  }, [node])

  useEffect(() => {
    if (open && node) {
      load()
    } else {
      setDetail(null)
      setActions([])
      setError(null)
      if (executeResultTimer.current) {
        clearTimeout(executeResultTimer.current)
        executeResultTimer.current = null
      }
      setExecuteResult(null)
      setCredentials(null)
      setCredentialsError(null)
    }
  }, [open, node, load])

  const handleShowCredentials = async () => {
    if (!node) return
    setCredentialsLoading(true)
    setCredentialsError(null)
    try {
      const creds = await nodeAdminService.getCredentials(node.id)
      setCredentials({ node_id: creds.node_id, api_key: creds.api_key })
    } catch {
      setCredentialsError('Failed to load credentials')
    } finally {
      setCredentialsLoading(false)
    }
  }

  const handleRemove = async () => {
    if (!node || !canRemove) return
    const confirmed = window.confirm(`Remove ${node.label}? This permanently deletes its metrics, alerts, simulations, and graph relationships.`)
    if (!confirmed) return

    setRemoving(true)
    setRemoveError(null)
    try {
      await nodeAdminService.deleteNode(node.id)
      onRemoved?.(node.id)
      onClose()
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : 'Failed to remove node')
    } finally {
      setRemoving(false)
    }
  }

  const showExecuteResult = (result: { id: string; ok: boolean; message: string }) => {
    if (executeResultTimer.current) clearTimeout(executeResultTimer.current)
    setExecuteResult(result)
    executeResultTimer.current = setTimeout(() => setExecuteResult(null), 4500)
  }

  const handleExecute = async (action: { id: string; name: string }) => {
    if (!node) return
    setExecutingId(action.id)
    setExecuteResult(null)
    try {
      await remediationService.executeAction(action.id, node.id, action.name)
      showExecuteResult({ id: action.id, ok: true, message: `"${action.name}" initiated successfully.` })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Execute failed'
      showExecuteResult({ id: action.id, ok: false, message: msg })
    } finally {
      setExecutingId(null)
    }
  }

  const healthColor = node ? HEALTH_COLORS[node.health] : '#626079'
  const dependencyNodes = node ? node.dependencies.map((id) => allNodes.find((candidate) => candidate.id === id)).filter((candidate): candidate is GraphNode => Boolean(candidate)) : []
  const dependentNodes = node ? node.dependents.map((id) => allNodes.find((candidate) => candidate.id === id)).filter((candidate): candidate is GraphNode => Boolean(candidate)) : []

  return (
    <>
    <CenteredModal
      open={open}
      onClose={onClose}
      title="Node Inspector"
      subtitle={node?.label}
      width="w-full max-w-5xl"
      headerAction={
        node && (
          // Icon-only, same compact size — these are secondary/occasional
          // actions (passport lookup, raw logs, jump to simulation), not
          // primary ones, so they read as a small utility cluster instead
          // of three competing buttons.
          <div className="flex items-center gap-1">
            <Link
              href={`/assets/${node.id}/passport`}
              className="flex items-center justify-center w-7 h-7 rounded border border-brand-border text-white/50 hover:text-cyan hover:border-cyan/40 transition-colors"
              title="Open this asset's QR passport"
            >
              <QrCode size={13} />
            </Link>
            <button
              type="button"
              onClick={() => setLogsOpen(true)}
              className="flex items-center justify-center w-7 h-7 rounded border border-brand-border text-white/50 hover:text-white hover:border-white/20 transition-colors"
              title="View node logs"
            >
              <ScrollText size={13} />
            </button>
            <Link
              href={ROUTES.SIMULATION}
              className="flex items-center justify-center w-7 h-7 rounded border border-cyan/30 text-cyan/70 hover:text-cyan hover:border-cyan/50 hover:bg-cyan/10 transition-colors"
              title="Run a What-If Scenario for this station"
            >
              <Zap size={13} />
            </Link>
          </div>
        )
      }
      embedded={embedded}
    >
      <div className="p-4 space-y-5">
        {error && (
          <div className="rounded border border-amber/30 bg-amber/10 px-3 py-2 text-[11px] text-amber">
            Live telemetry is unavailable for this topology node. Showing its available Digital Twin data instead.
          </div>
        )}

        {node && (
          <>
            {/* Base section — identical for every node type: name, type, status, last updated */}
            <div className="flex items-center gap-4">
              <HealthGauge score={node.healthScore} size={72} label="HEALTH" />
              <div className="flex-1 min-w-0">
                <h3 className="font-sans font-semibold text-white text-sm leading-tight truncate">
                  {node.label}
                </h3>
                <p className="text-white/40 text-xs mt-0.5 font-mono flex items-center gap-1.5">
                  {(() => {
                    const { icon: TypeIcon, label } = getNodeTypeConfig(node.type)
                    return (
                      <>
                        <TypeIcon size={12} />
                        <span>{label}</span>
                      </>
                    )
                  })()}
                  <span>· {node.stationId ? node.stationId.toUpperCase() : 'N/A'}{node.zoneId ? ` / ${node.zoneId}` : ''}</span>
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant={healthBadgeVariant[node.health]} dot>
                    {node.health}
                  </Badge>
                  {node.version && (
                    <span className="text-white/30 text-[10px] font-mono">{node.version}</span>
                  )}
                </div>
                <p className="text-white/25 text-[10px] font-mono mt-1">Updated {formatTimestamp(node.lastSync)}</p>
                <p className="text-[10px] font-mono mt-1" title="Type-weighted risk — derived from health score × node-type criticality, not the backend's raw risk_score">
                  <span className="text-white/30">TYPE-WEIGHTED RISK </span>
                  <span style={{ color: weightedRiskColor(computeWeightedRisk(node.healthScore, node.type)) }}>
                    {computeWeightedRisk(node.healthScore, node.type).toFixed(0)}
                  </span>
                </p>
              </div>
            </div>

            {/* Type-specific section — the mini-dashboard differs per node type (see components/graph/panels) */}
            {(() => {
              const TypePanel = getNodeTypePanel(node.type)
              return (
                <div className="border-t border-b border-brand-border py-4">
                  <TypePanel
                    node={node}
                    detail={detail}
                    allNodes={allNodes}
                    onJumpToNode={onSelectNode}
                  />
                </div>
              )
            })()}

            {/* Sparkline trend */}
            {detail?.trend && (
              <div>
                <p className="font-mono text-[10px] text-white/40 uppercase tracking-widest mb-1">24H HEALTH TREND</p>
                <Sparkline data={detail.trend} color={healthColor} height={40} />
              </div>
            )}

            {/* Meta info */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: AlertTriangle, label: 'Incidents', value: String(node.incidents) },
                { icon: Clock, label: 'Last Sync', value: formatTimestamp(node.lastSync) },
                { icon: Activity, label: 'Uptime', value: detail ? formatUptime(detail.uptime) : '—' },
                { icon: Server, label: 'Layer', value: node.layer },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="bg-brand-bg border border-brand-border rounded p-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon size={11} className="text-white/40" />
                    <span className="font-mono text-[10px] text-white/40 uppercase">{label}</span>
                  </div>
                  <p className="font-mono text-xs text-white truncate">{value}</p>
                </div>
              ))}
            </div>

            {/* Dependency mapping — selecting an entry moves both the inspector and graph focus to that node. */}
            {(node.dependencies.length > 0 || node.dependents.length > 0) && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Link2 size={11} className="text-white/40" />
                  <p className="font-mono text-[10px] text-white/40 uppercase tracking-widest">Dependency Map</p>
                </div>
                <div className="space-y-2">
                  {node.dependencies.length > 0 && (
                    <div>
                      <p className="mb-1 text-[9px] font-mono uppercase tracking-wider text-cyan/70">Upstream dependencies</p>
                      <div className="flex flex-wrap gap-1">
                        {node.dependencies.map((id) => {
                          const dependency = dependencyNodes.find((candidate) => candidate.id === id)
                          return <button key={id} onClick={() => onSelectNode?.(id)} className="text-[10px] font-mono text-cyan bg-cyan/10 border border-cyan/20 rounded px-1.5 py-0.5 hover:bg-cyan/20 transition-colors">
                            {dependency?.label ?? id}
                          </button>
                        })}
                      </div>
                    </div>
                  )}
                  {node.dependents.length > 0 && (
                    <div>
                      <p className="mb-1 text-[9px] font-mono uppercase tracking-wider text-amber/70">Downstream dependents</p>
                      <div className="flex flex-wrap gap-1">
                        {node.dependents.map((id) => {
                          const dependent = dependentNodes.find((candidate) => candidate.id === id)
                          return <button key={id} onClick={() => onSelectNode?.(id)} className="text-[10px] font-mono text-amber bg-amber/10 border border-amber/20 rounded px-1.5 py-0.5 hover:bg-amber/20 transition-colors">
                            {dependent?.label ?? id}
                          </button>
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Active alerts */}
            {detail && detail.alerts.length > 0 && (
              <div>
                <p className="font-mono text-[10px] text-white/40 uppercase tracking-widest mb-2">Active Alerts</p>
                <div className="space-y-1.5">
                  {detail.alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`rounded p-2.5 border text-xs ${
                        alert.severity === 'critical'
                          ? 'bg-crimson/10 border-crimson/30 text-crimson'
                          : alert.severity === 'warning'
                          ? 'bg-amber/10 border-amber/30 text-amber'
                          : 'bg-cyan/10 border-cyan/30 text-cyan'
                      }`}
                    >
                      <p className="font-sans">{alert.message}</p>
                      <p className="font-mono text-[10px] opacity-60 mt-0.5">{formatTimestamp(alert.timestamp)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Remediation actions */}
            {actions.length > 0 && (
              <div>
                <p className="font-mono text-[10px] text-white/40 uppercase tracking-widest mb-2">
                  Remediation Actions
                </p>
                <div className="space-y-2">
                  {actions.map((action) => (
                    <div key={action.id} className="bg-brand-bg border border-brand-border rounded p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white font-sans font-medium">{action.name}</p>
                          <p className="text-[10px] text-white/40 mt-0.5 font-sans">{action.estimatedTime} · {action.blastRadiusReduction}% blast radius reduction</p>
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <div className="flex-1 h-1 bg-brand-border rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald rounded-full"
                                style={{ width: `${action.historicalSuccessRate}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-mono text-emerald">{action.historicalSuccessRate}%</span>
                          </div>
                        </div>
                        <Button
                          variant="primary"
                          size="sm"
                          loading={executingId === action.id}
                          onClick={() => handleExecute({ id: action.id, name: action.name })}
                        >
                          Execute
                        </Button>
                      </div>
                      {executeResult?.id === action.id && (
                        <div className={`mt-2.5 rounded px-3 py-2 text-xs font-sans flex items-center gap-2 ${
                          executeResult.ok
                            ? 'bg-emerald/10 border border-emerald/30 text-emerald'
                            : 'bg-crimson/10 border border-crimson/30 text-crimson'
                        }`}>
                          <span className="font-bold text-sm leading-none">{executeResult.ok ? '✓' : '✕'}</span>
                          <span>{executeResult.message}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Node actions — type-default + per-node work-profile palette */}
            <div className="border-t border-brand-border pt-4">
              <NodeActionsSection node={node} />
            </div>

            {/* Agent credentials — re-fetchable node_id + api_key */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <KeyRound size={11} className="text-white/40" />
                <p className="font-mono text-[10px] text-white/40 uppercase tracking-widest">Agent Credentials</p>
              </div>
              {credentials ? (
                <div className="space-y-2">
                  <CopyField label="Node ID" value={credentials.node_id} />
                  <CopyField label="API Key" value={credentials.api_key} />
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<KeyRound size={12} />}
                  loading={credentialsLoading}
                  onClick={handleShowCredentials}
                  className="w-full"
                >
                  Show Node ID &amp; API Key
                </Button>
              )}
              {credentialsError && (
                <p className="text-[10px] font-mono text-crimson mt-1.5">{credentialsError}</p>
              )}
            </div>


            {/* Refresh */}
            <Button variant="ghost" size="sm" icon={<RefreshCw size={12} />} onClick={load} className="w-full">
              Refresh Node Data
            </Button>

            {canRemove && (
              <div className="border-t border-crimson/25 pt-4">
                <p className="mb-2 text-[10px] font-mono uppercase tracking-widest text-crimson/75">Danger zone</p>
                <Button variant="danger" size="sm" icon={<Trash2 size={12} />} loading={removing} onClick={handleRemove} className="w-full">
                  Remove node
                </Button>
                {removeError && <p className="mt-2 text-[10px] font-mono text-crimson">{removeError}</p>}
              </div>
            )}
          </>
        )}
      </div>
    </CenteredModal>
    {node && (
      <NodeLogsModal
        nodeId={node.id}
        nodeName={node.label}
        open={logsOpen}
        onClose={() => setLogsOpen(false)}
      />
    )}
    </>
  )
}
