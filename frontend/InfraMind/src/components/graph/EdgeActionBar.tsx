// src/components/graph/EdgeActionBar.tsx
'use client'

import { Trash2, Link2 } from 'lucide-react'

interface EdgeActionBarProps {
  sourceLabel: string
  targetLabel: string
  edgeType?: string
  onDelete: () => void
  onDeselect: () => void
}

/**
 * Floating pill overlay shown when an edge is selected on the canvas.
 * Provides quick actions: delete the edge or dismiss the selection.
 */
export function EdgeActionBar({ sourceLabel, targetLabel, edgeType, onDelete, onDeselect }: EdgeActionBarProps) {
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2.5 bg-brand-surface border border-brand-border rounded-full px-3.5 py-1.5 shadow-lg pointer-events-auto">
      <Link2 size={11} className="text-cyan shrink-0" />
      <span className="text-[10px] font-mono text-white/50 truncate max-w-[180px]">
        {sourceLabel} → {targetLabel}
      </span>
      {edgeType && (
        <>
          <div className="w-px h-3 bg-white/20" />
          <span className="text-[9px] font-mono text-cyan/60 uppercase">{edgeType}</span>
        </>
      )}
      <div className="w-px h-3 bg-white/20" />
      <button
        onClick={onDelete}
        className="flex items-center gap-1 text-[10px] font-mono text-crimson hover:text-red-400 transition-colors"
      >
        <Trash2 size={11} />
        Delete
      </button>
      <div className="w-px h-3 bg-white/20" />
      <button
        onClick={onDeselect}
        className="text-[10px] font-mono text-white/30 hover:text-white/60 transition-colors"
      >
        ✕
      </button>
    </div>
  )
}
