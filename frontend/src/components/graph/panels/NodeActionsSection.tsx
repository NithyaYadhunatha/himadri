// src/components/graph/panels/NodeActionsSection.tsx
//
// Collapsible action palette for a node. Fetches the node's work-profile from
// /api/node-work-profile, merges it with the type-default actions via
// getEffectiveActions(), groups by category (diagnostic / maintenance /
// emergency), and posts to /api/node-actions/execute which writes an
// ActivityLog row. Actions with requiresConfirmation show an inline
// confirm/cancel step before the POST fires.
'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Zap,
  Stethoscope,
  Wrench,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Plus,
} from 'lucide-react'
import { getEffectiveActions } from '@/lib/graph/workProfile'
import type { NodeAction } from '@/lib/graph/nodeTypes'
import type { WorkProfileLean } from '@/lib/graph/workProfile'
import type { GraphNode } from '@/types/graph'
import { NODE_ACTION_CATEGORIES } from '@/lib/nodeWorkProfile/constants'
import type { NodeActionCategory } from '@/lib/nodeWorkProfile/constants'

// ---------- category styling -----------------------------------------------

const CATEGORY_ORDER = ['diagnostic', 'maintenance', 'emergency'] as const
type ActionCategory = (typeof CATEGORY_ORDER)[number]

const CATEGORY_STYLE: Record<
  ActionCategory,
  {
    label: string
    Icon: React.ComponentType<{ size?: number; className?: string }>
    textClass: string
    buttonClass: string
    confirmClass: string
  }
> = {
  diagnostic: {
    label: 'Diagnostic',
    Icon: Stethoscope,
    textClass: 'text-cyan',
    buttonClass: 'border-cyan/20 text-cyan hover:bg-cyan/10',
    confirmClass: 'bg-cyan/10 border-cyan/30 text-cyan',
  },
  maintenance: {
    label: 'Maintenance',
    Icon: Wrench,
    textClass: 'text-amber',
    buttonClass: 'border-amber/20 text-amber hover:bg-amber/10',
    confirmClass: 'bg-amber/10 border-amber/30 text-amber',
  },
  emergency: {
    label: 'Emergency',
    Icon: AlertTriangle,
    textClass: 'text-crimson',
    buttonClass: 'border-crimson/20 text-crimson hover:bg-crimson/10',
    confirmClass: 'bg-crimson/10 border-crimson/30 text-crimson',
  },
}

// ---------- component -------------------------------------------------------

interface ExecuteResult {
  actionId: string
  ok: boolean
  message: string
}

export interface NodeActionsSectionProps {
  node: GraphNode
}

export function NodeActionsSection({ node }: NodeActionsSectionProps) {
  const [expanded, setExpanded] = useState(true)
  const [loading, setLoading] = useState(false)
  const [actions, setActions] = useState<NodeAction[]>([])

  const [pendingAction, setPendingAction] = useState<NodeAction | null>(null)
  const [executingId, setExecutingId] = useState<string | null>(null)
  const [executeResult, setExecuteResult] = useState<ExecuteResult | null>(null)
  const resultTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [profile, setProfile] = useState<WorkProfileLean | null>(null)

  const [addingAction, setAddingAction] = useState(false)
  const [newActionCategory, setNewActionCategory] = useState<NodeActionCategory>('diagnostic')
  const [newActionLabel, setNewActionLabel] = useState('')
  const [newActionDesc, setNewActionDesc] = useState('')
  const [savingAction, setSavingAction] = useState(false)

  // Fetch work-profile and derive effective action list whenever the node changes.
  // All setState calls live inside Promise chain callbacks — never in the synchronous
  // effect body — to satisfy the react-hooks/set-state-in-effect lint rule.
  useEffect(() => {
    let cancelled = false

    Promise.resolve()
      .then(() => {
        if (!cancelled) {
          setLoading(true)
          setPendingAction(null)
          setExecuteResult(null)
        }
        return fetch(`/api/node-work-profile?nodeKey=${encodeURIComponent(node.id)}`)
      })
      .then((r) =>
        r.ok
          ? (r.json() as Promise<{ profile: WorkProfileLean | null }>)
          : Promise.resolve({ profile: null }),
      )
      .then(({ profile }) => {
        if (!cancelled) {
          setProfile(profile)
          setActions(getEffectiveActions(node.type, profile))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProfile(null)
          setActions(getEffectiveActions(node.type, null))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [node.id, node.type])

  const showResult = (result: ExecuteResult) => {
    if (resultTimer.current) clearTimeout(resultTimer.current)
    setExecuteResult(result)
    resultTimer.current = setTimeout(() => setExecuteResult(null), 4500)
  }

  const executeAction = async (action: NodeAction) => {
    setPendingAction(null)
    setExecutingId(action.id)
    try {
      const res = await fetch('/api/node-actions/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeKey: node.id,
          actionId: action.id,
          actionLabel: action.label,
          nodeType: node.type,
        }),
      })
      if (!res.ok) {
        const err = (await res.json()) as { error?: string }
        throw new Error(err.error ?? 'Execute failed')
      }
      showResult({ actionId: action.id, ok: true, message: `"${action.label}" initiated.` })
    } catch (err) {
      showResult({
        actionId: action.id,
        ok: false,
        message: err instanceof Error ? err.message : 'Execute failed',
      })
    } finally {
      setExecutingId(null)
    }
  }

  const handleActionClick = (action: NodeAction) => {
    if (action.requiresConfirmation) {
      setPendingAction((prev) => (prev?.id === action.id ? null : action))
    } else {
      void executeAction(action)
    }
  }

  const handleAddAction = async () => {
    if (!newActionLabel.trim()) return
    setSavingAction(true)
    
    const newAction = {
      id: `custom.${Date.now()}`,
      label: newActionLabel,
      description: newActionDesc,
      category: newActionCategory,
      requiresConfirmation: false
    }

    const updatedProfile = {
      nodeKey: node.id,
      enabledActionIds: profile?.enabledActionIds ?? [],
      customActions: [...(profile?.customActions ?? []), newAction]
    }

    try {
      const res = await fetch('/api/node-work-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProfile)
      })
      if (!res.ok) throw new Error('Failed to save')
      const { profile: savedProfile } = await res.json()
      setProfile(savedProfile)
      setActions(getEffectiveActions(node.type, savedProfile))
      setAddingAction(false)
      setNewActionLabel('')
      setNewActionDesc('')
    } catch (e) {
      console.error(e)
    } finally {
      setSavingAction(false)
    }
  }

  // Group by category preserving the fixed display order.
  const byCategory = CATEGORY_ORDER.reduce<Partial<Record<ActionCategory, NodeAction[]>>>(
    (acc, cat) => {
      const catActions = actions.filter((a) => a.category === cat)
      if (catActions.length) acc[cat] = catActions
      return acc
    },
    {},
  )

  return (
    <div>
      {/* Section header — collapsible */}
      <button
        type="button"
        className="flex items-center justify-between w-full"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-1.5">
          <Zap size={11} className="text-white/62" />
          <p className="font-mono text-[10px] text-white/62 uppercase tracking-widest">
            Node Actions
          </p>
          {!loading && actions.length > 0 && (
            <span className="font-mono text-[10px] text-white/50">({actions.length})</span>
          )}
          {loading && <Loader2 size={9} className="text-white/55 animate-spin" />}
        </div>
        {expanded ? (
          <ChevronUp size={12} className="text-white/55" />
        ) : (
          <ChevronDown size={12} className="text-white/55" />
        )}
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="mt-2 space-y-3">
          {!loading && actions.length === 0 && (
            <p className="text-[10px] font-mono text-white/50 italic">
              No actions configured for this node type.
            </p>
          )}

          {(Object.entries(byCategory) as [ActionCategory, NodeAction[]][]).map(
            ([cat, catActions]) => {
              const style = CATEGORY_STYLE[cat]
              const { Icon } = style
              return (
                <div key={cat}>
                  {/* Category label */}
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Icon size={9} className={style.textClass} />
                    <span
                      className={`font-mono text-[10px] uppercase tracking-widest ${style.textClass} opacity-70`}
                    >
                      {style.label}
                    </span>
                  </div>

                  {/* Action list */}
                  <div className="space-y-1">
                    {catActions.map((action) => {
                      const isPending = pendingAction?.id === action.id
                      const isExecuting = executingId === action.id
                      const result =
                        executeResult?.actionId === action.id ? executeResult : null

                      return (
                        <div key={action.id}>
                          {/* Normal button row */}
                          {!isPending && (
                            <button
                              type="button"
                              disabled={isExecuting || !!executingId}
                              onClick={() => handleActionClick(action)}
                              title={action.description}
                              className={`w-full flex items-center justify-between gap-2 rounded border px-2.5 py-1.5 text-[10px] font-mono transition-colors disabled:opacity-40 ${style.buttonClass}`}
                            >
                              <span className="truncate text-left">{action.label}</span>
                              {isExecuting ? (
                                <Loader2 size={9} className="animate-spin shrink-0" />
                              ) : action.requiresConfirmation ? (
                                <AlertTriangle size={9} className="opacity-50 shrink-0" />
                              ) : null}
                            </button>
                          )}

                          {/* Inline confirmation panel */}
                          {isPending && (
                            <div
                              className={`rounded border px-2.5 py-2 space-y-1.5 ${style.confirmClass}`}
                            >
                              <p className="text-[10px] font-mono font-medium">{action.label}</p>
                              <p className="text-[10px] font-sans opacity-70 leading-relaxed">
                                {action.description}
                              </p>
                              <div className="flex gap-1.5 pt-0.5">
                                <button
                                  type="button"
                                  onClick={() => void executeAction(action)}
                                  className="flex-1 rounded bg-white/10 border border-white/20 px-2 py-1 text-[10px] font-mono hover:bg-white/15 transition-colors"
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPendingAction(null)}
                                  className="flex-1 rounded border border-white/10 px-2 py-1 text-[10px] font-mono text-white/62 hover:text-white hover:border-white/20 transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}

                          {/* 4.5 s success / error feedback */}
                          {result && (
                            <div
                              className={`mt-1 rounded px-2.5 py-1.5 text-[10px] font-sans flex items-center gap-1.5 ${
                                result.ok
                                  ? 'bg-emerald/10 border border-emerald/30 text-emerald'
                                  : 'bg-crimson/10 border border-crimson/30 text-crimson'
                              }`}
                            >
                              <span className="font-bold leading-none">
                                {result.ok ? '✓' : '✕'}
                              </span>
                              <span>{result.message}</span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            },
          )}

          {/* Add custom action */}
          <div className="pt-2 border-t border-brand-border/50">
            {addingAction ? (
              <div className="bg-brand-surface border border-brand-border rounded p-2.5 space-y-2">
                <p className="text-[10px] font-mono text-white/70 uppercase">New Custom Action</p>
                <input
                  type="text"
                  placeholder="Action Name"
                  value={newActionLabel}
                  onChange={(e) => setNewActionLabel(e.target.value)}
                  className="w-full bg-brand-bg border border-brand-border rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-cyan/50"
                />
                <textarea
                  placeholder="Description..."
                  value={newActionDesc}
                  onChange={(e) => setNewActionDesc(e.target.value)}
                  className="w-full bg-brand-bg border border-brand-border rounded px-2 py-1 text-[10px] font-mono text-white focus:outline-none focus:border-cyan/50 resize-y min-h-[40px]"
                />
                <select
                  value={newActionCategory}
                  onChange={(e) => setNewActionCategory(e.target.value as NodeActionCategory)}
                  className="w-full bg-brand-bg border border-brand-border rounded px-2 py-1 text-[10px] font-mono text-white focus:outline-none focus:border-cyan/50"
                >
                  {NODE_ACTION_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <div className="flex gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={handleAddAction}
                    disabled={!newActionLabel.trim() || savingAction}
                    className="flex-1 rounded border border-cyan/20 bg-cyan/10 px-2 py-1 text-[10px] font-mono text-cyan hover:bg-cyan/20 transition-colors disabled:opacity-50"
                  >
                    {savingAction ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddingAction(false)}
                    className="flex-1 rounded border border-white/10 px-2 py-1 text-[10px] font-mono text-white/62 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingAction(true)}
                className="w-full flex items-center justify-center gap-1.5 rounded border border-dashed border-white/10 py-1.5 text-[10px] font-mono text-white/62 hover:text-cyan hover:border-cyan/30 transition-colors"
              >
                <Plus size={10} />
                <span>Add Custom Action</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
