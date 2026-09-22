// src/components/graph/GraphNode.tsx
//
// Custom react-flow (@xyflow/react) node: type icon in a colored badge,
// name label, status dot, hover tooltip, and blast-radius-aware focus —
// selecting a node dims everything else and highlights, in full transitive
// chains (not just direct neighbors): cyan for its dependencies (what it
// needs), amber for its blast radius (what breaks if it fails). See
// FlowCanvas.tsx's use of lib/graph/blastRadius.ts for how those sets are
// computed. Replaces the old abbreviation-only CustomNode.tsx.

import { memo, useState } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import type { GraphNode as GraphNodeData } from '@/types/graph'
import { getNodeTypeConfig } from '@/lib/graph/nodeTypes'
import { HEALTH_COLORS } from '@/lib/constants'

export interface GraphNodeRenderData extends GraphNodeData {
  isDimmed?: boolean
  /** In the selected node's full transitive dependency chain — what it needs. Cyan glow. */
  isDependency?: boolean
  /** In the selected node's full transitive blast radius — what breaks if it fails. Amber glow. */
  isImpacted?: boolean
  /**
   * Result of the last "Build with AI" edit on this canvas (Scenario Builder
   * only — see page.tsx's lastChangeSet/displayNodes) — a persistent visual
   * echo of the AI's change on the main canvas itself, not just inside the
   * report modal's DiffGraphView. Same color language as that modal (green =
   * added, dashed crimson ghost = removed and no longer really part of the
   * topology, amber badge = a survivor that now depends on a gap). Distinct
   * from isDependency/isImpacted above — those are click-to-select blast
   * radius, this is "what the AI just changed."
   */
  diffStatus?: 'added' | 'removed' | 'modified' | 'impacted'
  colorMode?: 'health' | 'type'
  nodeSizeMode?: 'compact' | 'normal' | 'expanded'
  /** Node is currently marked as a simulation target (Scenario Builder multi-select). */
  isSimulationTarget?: boolean
}

const DIFF_STYLE: Record<'added' | 'removed' | 'modified' | 'impacted', { ring: string; chip: string; chipLabel: string; chipClass: string }> = {
  added: { ring: '#10B981', chip: '#10B981', chipLabel: '+ NEW', chipClass: 'bg-emerald text-brand-bg' },
  removed: { ring: '#EF4444', chip: '#EF4444', chipLabel: '− REMOVED', chipClass: 'bg-crimson text-white' },
  modified: { ring: '#06B6D4', chip: '#06B6D4', chipLabel: '⟳ MODIFIED', chipClass: 'bg-cyan text-brand-bg' },
  impacted: { ring: '#F59E0B', chip: '#F59E0B', chipLabel: '⚠ IMPACT', chipClass: 'bg-amber text-brand-bg' },
}

function GraphNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as GraphNodeRenderData
  const [hovered, setHovered] = useState(false)

  const { color: typeColor, icon: TypeIcon } = getNodeTypeConfig(nodeData.type)
  // Simulating nodes get the cyan "simulated" dot regardless of their health
  // score — the score reflects synthetic load, not genuine infrastructure state.
  const statusColor = nodeData.isSimulating
    ? HEALTH_COLORS.simulating
    : (HEALTH_COLORS[nodeData.health] ?? '#6E8AA0')
  const healthColor = statusColor;
  // In 'health' mode the badge border/glow tracks health; in 'type' mode (default) it tracks node type.
  const badgeColor = nodeData.colorMode === 'health' ? healthColor : typeColor
  // const statusColor = healthColor

  // Size proportional to dependencyCount (min 44px, max 88px) — icon badges
  // need a bit more room than the old text-abbreviation circles did.
  const sizePx = Math.min(88, Math.max(44, 44 + nodeData.dependencyCount * 3.5))
  const imageSize = sizePx

  const isHighlighted = nodeData.isDependency || nodeData.isImpacted
  const isFocusedAway = nodeData.isDimmed && !selected && !isHighlighted
  const diffStyle = nodeData.diffStatus ? DIFF_STYLE[nodeData.diffStatus] : null

  return (
    <div
      className="relative flex flex-col items-center gap-1.5 cursor-pointer transition-all duration-200"
      style={{
        opacity: diffStyle && nodeData.diffStatus === 'removed' ? 0.5 : isFocusedAway ? 0.25 : 1,
        transform: selected ? 'scale(1.12)' : hovered ? 'scale(1.06)' : 'scale(1)',
        outline: diffStyle
          ? `2px ${nodeData.diffStatus === 'removed' ? 'dashed' : 'solid'} ${diffStyle.ring}`
          : nodeData.isSimulationTarget
            ? '2.5px solid #F97316'
            : undefined,
        outlineOffset: (diffStyle || nodeData.isSimulationTarget) ? '4px' : undefined,
        borderRadius: (diffStyle || nodeData.isSimulationTarget) ? '10px' : undefined,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {diffStyle && (
        <span
          className={`absolute -top-2.5 left-1/2 -translate-x-1/2 z-30 shrink-0 text-[7px] font-mono font-bold rounded px-1.5 py-[1px] whitespace-nowrap ${diffStyle.chipClass}`}
        >
          {diffStyle.chipLabel}
        </span>
      )}
      {nodeData.isSimulationTarget && !diffStyle && (
        <span
          className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-30 shrink-0 text-[7px] font-mono font-bold rounded px-1.5 py-[1px] whitespace-nowrap"
          style={{ backgroundColor: '#F97316', color: 'white' }}
        >
          ▶ SIM
        </span>
      )}

      <Handle
        type="target"
        position={Position.Top}
        className="w-2 h-2 !bg-brand-bg !border-cyan !opacity-30 hover:!opacity-100 transition-opacity z-20"
      />

      {/* Icon sits on a solid badge disc — the icon assets are mid-toned
          (avg ~rgb(40,120,135), not literally pale), but with nothing behind
          them they read as faint/washed-out against the light cream canvas
          background. badgeColor already existed for this (health or type
          color depending on colorMode) but had no consumer. */}
      <div
        className="relative flex items-center justify-center transition-all"
        style={{
          width: `${imageSize}px`,
          height: `${imageSize}px`,
          filter: nodeData.isSimulationTarget
            ? `drop-shadow(0 0 10px #F97316) brightness(1.15)`
            : selected
              ? `drop-shadow(0 0 8px #1868A0) brightness(1.15)`
              : nodeData.isDependency
                ? `drop-shadow(0 0 8px #00D4FF) brightness(1.15)`
                : nodeData.isImpacted
                  ? `drop-shadow(0 0 8px #B8720F) brightness(1.15)`
                  : hovered
                    ? `drop-shadow(0 0 4px #1868A0aa) brightness(1.1)`
                    : 'none',
        }}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            backgroundColor: '#F7FBFD',
            border: `2px solid ${badgeColor}`,
            boxShadow: `inset 0 0 0 3px ${badgeColor}33, 0 1px 3px rgba(22, 40, 58,0.25)`,
          }}
        />
        <TypeIcon
          size={Math.round(imageSize * 0.5)}
          style={{
            position: 'relative',
            color: badgeColor,
          }}
        />

        {/* Status dot — health, independent of the image itself */}
        <div
          className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-brand-bg z-10"
          style={{ backgroundColor: statusColor, boxShadow: `0 0 4px ${statusColor}77` }}
        />

        {/* Incident badge */}
        {nodeData.incidents > 0 && (
          <div
            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-crimson border border-brand-bg
              flex items-center justify-center text-[9px] font-mono font-bold text-white z-10"
          >
            {nodeData.incidents > 9 ? '9+' : nodeData.incidents}
          </div>
        )}
      </div>

      {/* Label and Sub-label (Node Type) */}
      <div className="flex flex-col items-center gap-0.5 mt-0.5 pointer-events-none">
        <div
          className="font-mono text-center leading-tight truncate"
          style={{
            color: selected ? '#16283A' : '#3A5468',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            maxWidth: `${Math.max(100, sizePx * 1.5)}px`,
            textShadow: selected ? '0 0 8px rgba(31, 158, 109, 0.3)' : 'none'
          }}
        >
          {nodeData.label}
        </div>
        <div
          className="font-mono text-center leading-tight uppercase font-medium tracking-wide"
          style={{
            color: typeColor,
            fontSize: '8px',
            maxWidth: `${Math.max(100, sizePx * 1.5)}px`,
          }}
        >
          {getNodeTypeConfig(nodeData.type).label}
        </div>
      </div>

      {/* Hover tooltip — simplified, maybe not needed if type is always visible, 
          but keeping for health score */}
      {hovered && !selected && (
        <div
          className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-30 pointer-events-none
            bg-brand-surface border border-brand-border rounded px-2 py-1 shadow-lg whitespace-nowrap"
        >
          <p className="font-mono text-[9px] text-[#1868A0]">
            Health {nodeData.healthScore}
          </p>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-2 h-2 !bg-brand-bg !border-cyan !opacity-30 hover:!opacity-100 transition-opacity z-20"
      />
    </div>
  )
}

export const GraphNode = memo(GraphNodeComponent)
