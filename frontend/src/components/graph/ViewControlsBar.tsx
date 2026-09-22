// src/components/graph/ViewControlsBar.tsx
//
// Compact toolbar row that sits between the top Digital Twin header and the
// GraphFilterBar. Color mode and Fullscreen stay directly visible (the ones
// actually reached for often); layout preset, node size, edge labels, and
// legend — fiddled with rarely, once per session at most — are tucked into
// a single "Display Options" popover instead of five more buttons in the
// same row. All state still lives in the parent (twin/page.tsx) and is
// persisted to /api/user/preferences.
'use client'

import { useState, useRef, useEffect } from 'react'
import { Maximize2, AlignStartVertical, AlignStartHorizontal, Circle, Type, SlidersHorizontal, ChevronDown } from 'lucide-react'
import type { LayoutPreset, NodeSizeMode, ColorMode } from '@/lib/models/UserPreferences'

interface ViewControlsBarProps {
  layoutPreset: LayoutPreset
  onLayoutPreset: (v: LayoutPreset) => void
  nodeSizeMode: NodeSizeMode
  onNodeSizeMode: (v: NodeSizeMode) => void
  colorMode: ColorMode
  onColorMode: (v: ColorMode) => void
  showEdgeLabels: boolean
  onShowEdgeLabels: (v: boolean) => void
  showLegend: boolean
  onShowLegend: (v: boolean) => void
  onFullscreen: () => void
}

function SegmentBtn({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1 px-2 py-1 text-[10px] font-mono rounded transition-colors ${
        active
          ? 'bg-cyan/20 text-cyan border border-cyan/40'
          : 'text-white/40 border border-transparent hover:text-white/70 hover:border-brand-border'
      }`}
    >
      {children}
    </button>
  )
}

function ToggleBtn({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1 px-2 py-1 text-[10px] font-mono rounded border transition-colors ${
        active
          ? 'bg-cyan/20 text-cyan border-cyan/40'
          : 'text-white/40 border-brand-border hover:text-white/70'
      }`}
    >
      {children}
    </button>
  )
}

export function ViewControlsBar({
  layoutPreset,
  onLayoutPreset,
  nodeSizeMode,
  onNodeSizeMode,
  colorMode,
  onColorMode,
  showEdgeLabels,
  onShowEdgeLabels,
  showLegend,
  onShowLegend,
  onFullscreen,
}: ViewControlsBarProps) {
  const [displayOpen, setDisplayOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!displayOpen) return
    function onClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setDisplayOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [displayOpen])

  return (
    <div className="flex items-center gap-3 px-4 py-1.5 border-b border-brand-border bg-brand-bg shrink-0 overflow-x-auto">
      {/* Color mode — the one toggle actually reached for mid-session */}
      <div className="flex items-center gap-1 shrink-0">
        <span className="font-mono text-[9px] text-white/25 uppercase tracking-wider mr-1">Color</span>
        <SegmentBtn active={colorMode === 'type'} onClick={() => onColorMode('type')} title="Color by node type">
          Type
        </SegmentBtn>
        <SegmentBtn active={colorMode === 'health'} onClick={() => onColorMode('health')} title="Color by health status">
          Health
        </SegmentBtn>
      </div>

      <div className="w-px h-3 bg-brand-border shrink-0" />

      {/* Display Options — layout preset, node size, edge labels, legend:
          set-once-per-session controls, tucked behind one button instead of
          a wall of segmented toggles. */}
      <div className="relative shrink-0" ref={popoverRef}>
        <button
          onClick={() => setDisplayOpen((o) => !o)}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono rounded border transition-colors ${
            displayOpen ? 'bg-cyan/20 text-cyan border-cyan/40' : 'text-white/40 border-brand-border hover:text-white/70'
          }`}
        >
          <SlidersHorizontal size={10} />
          Display Options
          <ChevronDown size={10} className={`transition-transform ${displayOpen ? 'rotate-180' : ''}`} />
        </button>

        {displayOpen && (
          <div className="absolute top-full left-0 mt-1.5 z-20 w-64 bg-brand-surface border border-brand-border rounded-lg shadow-xl p-3 space-y-3">
            <div>
              <span className="font-mono text-[9px] text-white/40 uppercase tracking-wider">Layout</span>
              <div className="flex items-center gap-1 mt-1.5">
                <SegmentBtn active={layoutPreset === 'TB'} onClick={() => onLayoutPreset('TB')} title="Zone-banded / hierarchical top-down">
                  <AlignStartVertical size={10} />
                  TB
                </SegmentBtn>
                <SegmentBtn active={layoutPreset === 'LR'} onClick={() => onLayoutPreset('LR')} title="Hierarchical left-right">
                  <AlignStartHorizontal size={10} />
                  LR
                </SegmentBtn>
                <SegmentBtn active={layoutPreset === 'circular'} onClick={() => onLayoutPreset('circular')} title="Circular">
                  <Circle size={10} />
                  Circ
                </SegmentBtn>
              </div>
            </div>

            <div>
              <span className="font-mono text-[9px] text-white/40 uppercase tracking-wider">Node Size</span>
              <div className="flex items-center gap-1 mt-1.5">
                <SegmentBtn active={nodeSizeMode === 'compact'} onClick={() => onNodeSizeMode('compact')} title="Compact nodes">S</SegmentBtn>
                <SegmentBtn active={nodeSizeMode === 'normal'} onClick={() => onNodeSizeMode('normal')} title="Normal nodes">M</SegmentBtn>
                <SegmentBtn active={nodeSizeMode === 'expanded'} onClick={() => onNodeSizeMode('expanded')} title="Expanded nodes">L</SegmentBtn>
              </div>
            </div>

            <div>
              <span className="font-mono text-[9px] text-white/40 uppercase tracking-wider">Overlays</span>
              <div className="flex items-center gap-1 mt-1.5">
                <ToggleBtn active={showEdgeLabels} onClick={() => onShowEdgeLabels(!showEdgeLabels)} title="Toggle edge labels">
                  <Type size={10} />
                  Labels
                </ToggleBtn>
                <ToggleBtn active={showLegend} onClick={() => onShowLegend(!showLegend)} title="Toggle legend">
                  Legend
                </ToggleBtn>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="ml-auto shrink-0">
        <button
          onClick={onFullscreen}
          title="Toggle fullscreen"
          className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono text-white/40 border border-transparent rounded hover:text-white/70 hover:border-brand-border transition-colors"
        >
          <Maximize2 size={10} />
          Fullscreen
        </button>
      </div>
    </div>
  )
}
