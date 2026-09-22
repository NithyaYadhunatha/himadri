// src/components/graph/AddEdgeModal.tsx
'use client'

import { useState, useMemo } from 'react'
import { Link2, Plus } from 'lucide-react'
import { CenteredModal } from '@/components/ui/CenteredModal'
import { Button } from '@/components/ui/Button'
import type { GraphNode, GraphEdge } from '@/types/graph'

const EDGE_TYPES = [
  'DEPENDS_ON',
  'FUELED_BY',
  'FEEDS',
  'BACKS_UP',
  'MONITORS',
  'CONNECTED_TO',
] as const

interface AddEdgeModalProps {
  open: boolean
  onClose: () => void
  nodes: GraphNode[]
  existingEdges: GraphEdge[]
  onAdd: (edge: GraphEdge) => void
}

export function AddEdgeModal({ open, onClose, nodes, existingEdges, onAdd }: AddEdgeModalProps) {
  const [sourceId, setSourceId] = useState('')
  const [targetId, setTargetId] = useState('')
  const [edgeType, setEdgeType] = useState<string>(EDGE_TYPES[0])
  const [customType, setCustomType] = useState('')
  const [useCustomType, setUseCustomType] = useState(false)

  // Don't allow duplicate edges (same source+target pair)
  const isDuplicate = useMemo(() => {
    if (!sourceId || !targetId) return false
    return existingEdges.some(
      (e) =>
        (e.source === sourceId && e.target === targetId) ||
        (e.source === targetId && e.target === sourceId)
    )
  }, [sourceId, targetId, existingEdges])

  const canSubmit = sourceId && targetId && sourceId !== targetId && !isDuplicate && (useCustomType ? customType.trim() : edgeType)

  const handleAdd = () => {
    if (!canSubmit) return
    const resolvedType = useCustomType ? customType.trim() : edgeType
    const newEdge: GraphEdge = {
      id: `edge-${sourceId}-${targetId}-${Date.now()}`,
      source: sourceId,
      target: targetId,
      type: resolvedType,
      health: 'healthy',
    }
    onAdd(newEdge)
    // Reset form
    setSourceId('')
    setTargetId('')
    setEdgeType(EDGE_TYPES[0])
    setCustomType('')
    setUseCustomType(false)
    onClose()
  }

  const handleClose = () => {
    setSourceId('')
    setTargetId('')
    setEdgeType(EDGE_TYPES[0])
    setCustomType('')
    setUseCustomType(false)
    onClose()
  }

  return (
    <CenteredModal open={open} onClose={handleClose} title="Add Edge" subtitle="Create a connection between two nodes" width="w-full max-w-md">
      <div className="p-5 space-y-4">
        {/* Source Node */}
        <div>
          <label className="font-mono text-[10px] text-white/40 uppercase tracking-widest block mb-1.5">
            Source Node
          </label>
          <select
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan/50 appearance-none cursor-pointer"
          >
            <option value="">Select source node…</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id} disabled={n.id === targetId}>
                {n.label} ({n.type})
              </option>
            ))}
          </select>
        </div>

        {/* Target Node */}
        <div>
          <label className="font-mono text-[10px] text-white/40 uppercase tracking-widest block mb-1.5">
            Target Node
          </label>
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan/50 appearance-none cursor-pointer"
          >
            <option value="">Select target node…</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id} disabled={n.id === sourceId}>
                {n.label} ({n.type})
              </option>
            ))}
          </select>
        </div>

        {/* Edge direction hint */}
        {sourceId && targetId && sourceId !== targetId && (
          <div className="flex items-center gap-2 p-2.5 bg-cyan/5 border border-cyan/20 rounded text-[10px] font-mono text-cyan/70">
            <Link2 size={11} className="shrink-0" />
            <span>
              {nodes.find((n) => n.id === sourceId)?.label ?? sourceId} → {nodes.find((n) => n.id === targetId)?.label ?? targetId}
            </span>
          </div>
        )}

        {/* Duplicate warning */}
        {isDuplicate && (
          <div className="p-2.5 bg-crimson/10 border border-crimson/30 rounded text-[10px] font-mono text-crimson">
            An edge already exists between these two nodes.
          </div>
        )}

        {/* Relationship Type */}
        <div>
          <label className="font-mono text-[10px] text-white/40 uppercase tracking-widest block mb-1.5">
            Relationship Type
          </label>
          {!useCustomType ? (
            <div className="space-y-2">
              <select
                value={edgeType}
                onChange={(e) => setEdgeType(e.target.value)}
                className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan/50 appearance-none cursor-pointer"
              >
                {EDGE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setUseCustomType(true)}
                className="text-[10px] font-mono text-cyan/60 hover:text-cyan transition-colors"
              >
                + Use custom type
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                type="text"
                value={customType}
                onChange={(e) => setCustomType(e.target.value)}
                placeholder="e.g. FAILOVER, BACKUP_TO…"
                className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan/50 placeholder:text-white/20"
              />
              <button
                type="button"
                onClick={() => { setUseCustomType(false); setCustomType('') }}
                className="text-[10px] font-mono text-white/40 hover:text-white/60 transition-colors"
              >
                ← Use preset type
              </button>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={13} />}
            onClick={handleAdd}
            disabled={!canSubmit}
            className="flex-1"
          >
            Add Edge
          </Button>
          <Button variant="ghost" size="sm" onClick={handleClose} className="flex-1">
            Cancel
          </Button>
        </div>
      </div>
    </CenteredModal>
  )
}
