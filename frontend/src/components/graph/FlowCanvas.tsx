// src/components/graph/FlowCanvas.tsx
'use client'

import { useCallback, useMemo, useEffect, useRef, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  ViewportPortal,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type OnConnect,
  addEdge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { LayoutGrid, Lock } from 'lucide-react'
import { GraphNode, type GraphNodeRenderData } from './GraphNode'
import { layoutWithDagre, layoutCircular } from '@/lib/graph/layout'
import { canUseZoneBands, computeCategoryLayout, computeZoneBandedLayout, type ZoneLayoutBox } from '@/lib/graph/zoneLayout'
import { computeBlastRadius, computeDependencyChain } from '@/lib/graph/blastRadius'
import type { GraphNode as GraphNodeData, GraphEdge, ZoneMeta } from '@/types/graph'
import { HEALTH_COLORS } from '@/lib/constants'
import { NODE_TYPE_CATEGORIES } from '@/lib/graph/nodeTypes'
import type { LayoutPreset, ColorMode, NodeSizeMode } from '@/lib/models/UserPreferences'

// Runs whichever layout the current preset calls for: zone-banded (real
// station architecture — see zoneLayout.ts) when the caller supplied zones
// and the preset is the default 'TB', otherwise plain dagre/circular
// auto-layout exactly as before. Centralized so the initial layout, the
// "new nodes arrived" effect, the preset-switch effect, and the manual
// Re-layout button all agree on what "laid out" means.
function runLayout(
  built: Node[],
  graphNodesData: GraphNodeData[],
  edges: GraphEdge[],
  preset: LayoutPreset,
  zones: ZoneMeta[] | undefined,
): { nodes: Node[]; boxes: ZoneLayoutBox[] } {
  const zoned = graphNodesData.filter((n) => !!n.zoneId).length
  if (preset === 'TB' && canUseZoneBands(graphNodesData, zones) && zoned >= graphNodesData.length * 0.5) {
    return computeZoneBandedLayout(built, graphNodesData, zones)
  }
  if (preset === 'circular') return { nodes: layoutCircular(built), boxes: [] }
  // No zone data and a sparse dependency graph: dagre would stack every asset
  // into one rank, so cluster by category instead.
  if (preset === 'TB' && graphNodesData.length > 12 && edges.length < graphNodesData.length / 2) {
    return computeCategoryLayout(built, graphNodesData)
  }
  return { nodes: layoutWithDagre(built, toStructuralEdges(edges), { direction: preset === 'LR' ? 'LR' : 'TB' }), boxes: [] }
}

// Background rectangles + labels for the zone-banded layout's bands (floors/
// main-outdoor split) and clusters (rooms/sites) — rendered inside
// ViewportPortal so they pan/zoom with the graph exactly like real nodes,
// without needing to be actual ReactFlow nodes (keeps them out of
// selection/drag/fitView bounds-fitting weirdness... except fitView, which
// only looks at nodes/edges anyway, so these never skew it).
function ZoneBandOverlay({ boxes }: { boxes: ZoneLayoutBox[] }) {
  if (boxes.length === 0) return null
  return (
    <>
      {boxes.map((box) => (
        <div
          key={box.id}
          className="absolute pointer-events-none"
          style={{
            left: box.x,
            top: box.y,
            width: box.width,
            height: box.height,
            border: box.kind === 'band' ? '2px dashed #3A3AB855' : '1.5px dashed #8A857677',
            borderRadius: box.kind === 'band' ? 10 : 6,
            background: box.kind === 'band' ? 'rgba(58,58,184,0.05)' : 'rgba(110,138,160,0.05)',
          }}
        >
          <div
            className={`absolute -top-1 left-2.5 -translate-y-full font-mono uppercase tracking-wider flex items-center gap-1 rounded px-1.5 py-0.5 ${
              box.kind === 'band'
                ? 'text-[11px] text-[#3A3AB8] font-bold bg-[#FFFEFBee] border border-[#3A3AB833]'
                : 'text-[9px] text-[#1C1F3399] bg-[#FFFEFBcc]'
            }`}
          >
            {box.restricted && <Lock size={box.kind === 'band' ? 9 : 8} />}
            {box.label}
          </div>
        </div>
      ))}
    </>
  )
}

const nodeTypes = { custom: GraphNode }

function toFlowNode(
  n: GraphNodeData,
  selectedNodeId: string | null,
  dependencyChainIds: Set<string>,
  blastRadiusIds: Set<string>,
  colorMode: ColorMode,
  nodeSizeMode: NodeSizeMode,
  diffStatusById?: Map<string, 'added' | 'removed' | 'modified' | 'impacted'>,
  simulationTargetNodeIds?: string[],
): Node {
  const renderData: GraphNodeRenderData = {
    ...n,
    isDimmed: selectedNodeId !== null,
    isDependency: dependencyChainIds.has(n.id),
    isImpacted: blastRadiusIds.has(n.id),
    diffStatus: diffStatusById?.get(n.id),
    colorMode,
    nodeSizeMode,
    isSimulationTarget: simulationTargetNodeIds ? simulationTargetNodeIds.includes(n.id) : false,
  }
  return {
    id: n.id,
    type: 'custom',
    position: n.position ?? { x: Math.random() * 800, y: Math.random() * 600 },
    data: renderData as unknown as Record<string, unknown>,
    selected: n.id === selectedNodeId,
  }
}

// Minimal edge shape dagre needs (id/source/target only) — cheaper than
// building full styled toFlowEdge objects just to feed the layout pass.
function toStructuralEdges(edges: GraphEdge[]): Edge[] {
  return edges.map((e) => ({ id: e.id, source: e.source, target: e.target }))
}

function fromFlowEdge(e: Edge): GraphEdge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    type: typeof e.label === 'string' ? e.label : 'DEPENDS_ON',
    health: 'healthy',
  }
}

function fromFlowNode(n: Node): GraphNodeData {
  // Spreads all fields including any render-only injections (isDimmed, isDependency,
  // isImpacted, colorMode, nodeSizeMode) — those extra keys are harmless under
  // structural typing and callers only read the GraphNodeData fields they care about.
  return { ...(n.data as unknown as GraphNodeData), position: n.position }
}

function toFlowEdge(
  e: GraphEdge,
  dimmed: boolean,
  showLabel: boolean,
  selectedEdgeId: string | null,
  dependencyChainIds: Set<string>,
  blastRadiusIds: Set<string>,
  selectedNodeId: string | null,
  animateDataFlowEdges = false,
): Edge {
  const latency = e.latency ?? 0
  const score = latency > 300 ? 20 : latency > 100 ? 60 : 100
  const isSelected = e.id === selectedEdgeId

  // An edge is "in the dependency chain" when both its endpoints are (the
  // selected node counts as its own chain's root) — same for blast radius.
  // This traces the actual highlighted path rather than just tinting every
  // edge touching a highlighted node, so unrelated edges between two
  // otherwise-highlighted-for-different-reasons nodes stay dim.
  const inChain = (ids: Set<string>) =>
    (e.source === selectedNodeId || ids.has(e.source)) && (e.target === selectedNodeId || ids.has(e.target))
  const isDependencyEdge = dimmed && inChain(dependencyChainIds)
  const isImpactEdge = dimmed && inChain(blastRadiusIds)

  const color = isDependencyEdge
    ? '#00D4FF'
    : isImpactEdge
      ? '#D4820A'
      : score >= 80 ? '#0F8A6A' : score >= 50 ? '#D4820A' : '#C23B3B'
  const isPathHighlighted = isDependencyEdge || isImpactEdge

  return {
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'smoothstep',
    label: showLabel ? e.type : undefined,
    labelStyle: showLabel ? { fill: '#1C1F3366', fontSize: 9, fontFamily: 'var(--font-mono)' } : undefined,
    labelBgStyle: showLabel ? { fill: '#FFFEFB', fillOpacity: 0.9 } : undefined,
    style: {
      stroke: color,
      strokeWidth: isSelected || isPathHighlighted ? 2.75 : 2,
      opacity: dimmed && !isSelected && !isPathHighlighted ? 0.15 : (isSelected ? 1 : 0.92),
    },
    // Bandwidth-carrying edges get the same dashed-line "flow" animation
    // xyflow already uses for unhealthy links, opt-in only (Replay's ghost
    // canvas is the only caller today) — a link with no known bandwidth has
    // no data movement to show, so it's left as a static line.
    animated: score < 50 || (animateDataFlowEdges && Boolean(e.bandwidth && e.bandwidth > 0)),
    selected: isSelected,
  }
}

// Legend rendered inside the canvas as an absolute overlay.
function CanvasLegend({ colorMode }: { colorMode: ColorMode }) {
  if (colorMode === 'type') {
    return (
      <div className="absolute bottom-12 left-3 z-10 bg-brand-surface/90 border border-brand-border rounded p-2.5 shadow-lg pointer-events-none max-w-[160px]">
        <p className="font-mono text-[8px] text-white/40 uppercase tracking-wider mb-2">Node Type</p>
        <div className="space-y-1">
          {NODE_TYPE_CATEGORIES.map((cat) => (
            <div key={cat.types[0]} className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: cat.config.color }}
              />
              <span className="font-mono text-[9px] text-white/60">{cat.config.label}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // health color mode
  const buckets = [
    { label: 'Healthy', color: HEALTH_COLORS.healthy },
    { label: 'Degraded', color: HEALTH_COLORS.degraded },
    { label: 'Critical', color: HEALTH_COLORS.critical },
    { label: 'Offline', color: HEALTH_COLORS.unreachable },
    { label: 'Simulating', color: HEALTH_COLORS.simulating },
  ]
  return (
    <div className="absolute bottom-12 left-3 z-10 bg-brand-surface/90 border border-brand-border rounded p-2.5 shadow-lg pointer-events-none">
      <p className="font-mono text-[8px] text-white/40 uppercase tracking-wider mb-2">Health</p>
      <div className="space-y-1">
        {buckets.map((b) => (
          <div key={b.label} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
            <span className="font-mono text-[9px] text-white/60">{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Shown instead of/alongside CanvasLegend whenever a node is selected —
// explains the cyan/amber highlight colors toFlowNode/toFlowEdge apply and
// gives the counts, since "17 nodes lit up amber" isn't self-explanatory
// without a key.
function ImpactLegend({ dependencyCount, impactCount }: { dependencyCount: number; impactCount: number }) {
  return (
    <div className="absolute bottom-12 right-3 z-10 bg-brand-surface/90 border border-brand-border rounded p-2.5 shadow-lg pointer-events-none">
      <p className="font-mono text-[8px] text-white/40 uppercase tracking-wider mb-2">Impact Analysis</p>
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#00D4FF' }} />
          <span className="font-mono text-[9px] text-white/60">Depends on ({dependencyCount})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#D4820A' }} />
          <span className="font-mono text-[9px] text-white/60">Impacted if it fails ({impactCount})</span>
        </div>
      </div>
    </div>
  )
}

interface FlowCanvasProps {
  nodes: GraphNodeData[]
  edges: GraphEdge[]
  /** Station zone metadata (floors/rooms/outdoor sites) — when supplied and
   * every node belongs to one known station, the default 'TB' layout groups
   * nodes into that station's real architecture (see zoneLayout.ts) instead
   * of one flat auto-layout. Omit for graphs with no station/zone concept
   * (Scenario Builder, Replay, etc.) to keep their existing plain dagre. */
  zones?: ZoneMeta[]
  onNodeClick?: (node: GraphNodeData, event?: React.MouseEvent) => void
  onEdgeClick?: (edge: GraphEdge) => void
  selectedNodeId?: string | null
  selectedEdgeId?: string | null
  className?: string
  readOnly?: boolean
  onDrop?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  showRelayoutButton?: boolean
  /** Called whenever the user draws or removes an edge on the canvas, so the
   *  parent's edge state stays in sync for Save. */
  onEdgesUpdate?: (edges: GraphEdge[]) => void
  /** Called once after the user finishes dragging a node, so the parent's
   *  node state captures the final positions for Save. */
  onNodesUpdate?: (nodes: GraphNodeData[]) => void
  // View control props — all optional; sensible defaults applied.
  colorMode?: ColorMode
  nodeSizeMode?: NodeSizeMode
  showEdgeLabels?: boolean
  showLegend?: boolean
  layoutPreset?: LayoutPreset
  /** Scenario Builder only — persistent "AI just changed this" markers from
   *  the last Build-with-AI edit. See GraphNodeRenderData.diffStatus. */
  diffStatusById?: Map<string, 'added' | 'removed' | 'modified' | 'impacted'>
  /** Scenario Builder only — nodes currently marked as simulation targets
   *  (ctrl/shift-click multi-select). Rendered with an orange ring + chip. */
  simulationTargetNodeIds?: string[]
  /** Replay only — animates the dashed-line "flow" effect on any edge that
   *  has a known bandwidth value, to visualize data movement. Off by
   *  default so every other caller's edges render exactly as before. */
  animateDataFlowEdges?: boolean
}

function FlowCanvasInner({
  nodes: graphNodes,
  edges: graphEdges,
  zones,
  onNodeClick,
  onEdgeClick,
  selectedNodeId = null,
  selectedEdgeId = null,
  className = '',
  readOnly = true,
  onDrop,
  onDragOver,
  showRelayoutButton = false,
  onEdgesUpdate,
  onNodesUpdate,
  colorMode = 'type',
  nodeSizeMode = 'normal',
  showEdgeLabels = false,
  showLegend = false,
  layoutPreset = 'TB',
  diffStatusById,
  simulationTargetNodeIds,
  animateDataFlowEdges = false,
}: FlowCanvasProps) {
  // See GraphNode.tsx's header comment and lib/graph/blastRadius.ts for the
  // direction convention (source depends on target). Both chains are capped
  // at maxDepth: 1 (direct connections only) — a multi-hop walk here read as
  // "everything indirectly connected" showing up as a dependency/impact,
  // which overstated the actual direct relationship. Both exclude the
  // selected node itself (computeBlastRadius never includes the origin).
  const dependencyChainIds = useMemo(() => {
    if (!selectedNodeId) return new Set<string>()
    return new Set(computeDependencyChain(selectedNodeId, graphEdges, { maxDepth: 1 }).impacted.map((e) => e.nodeId))
  }, [selectedNodeId, graphEdges])

  const blastRadiusIds = useMemo(() => {
    if (!selectedNodeId) return new Set<string>()
    return new Set(computeBlastRadius(selectedNodeId, graphEdges, { maxDepth: 1 }).impacted.map((e) => e.nodeId))
  }, [selectedNodeId, graphEdges])

  // Deliberately computed once — react-flow then owns node/edge state via
  // useNodesState/useEdgesState, and the effects below resync it on prop
  // changes while preserving any positions the user has since dragged to.
  // If the incoming data has no positions at all (a fresh Load Live / Load
  // Architecture / AI-build result — the live backend and the AI copilot
  // don't produce x/y coordinates), lay it out with dagre up front instead
  // of letting toFlowNode's per-node random fallback scatter everything.
  const initialLayout = useMemo(() => {
    const built = graphNodes.map((n) => toFlowNode(n, selectedNodeId, dependencyChainIds, blastRadiusIds, colorMode, nodeSizeMode, diffStatusById, simulationTargetNodeIds))
    if (graphNodes.length <= 1 || !graphNodes.some((n) => !n.position)) return { nodes: built, boxes: [] as ZoneLayoutBox[] }
    return runLayout(built, graphNodes, graphEdges, layoutPreset, zones)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const initialNodes = initialLayout.nodes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialEdges = useMemo(() => graphEdges.map((e) => toFlowEdge(e, Boolean(selectedNodeId), showEdgeLabels, selectedEdgeId, dependencyChainIds, blastRadiusIds, selectedNodeId, animateDataFlowEdges)), [])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [zoneBoxes, setZoneBoxes] = useState<ZoneLayoutBox[]>(initialLayout.boxes)
  const { fitView } = useReactFlow()

  // Tracks node ids that have ever had a position resolved (from the API or
  // a previous local drag) — used below to tell "genuinely new, position-
  // less nodes just arrived" apart from "same nodes re-rendering."
  const positionedIdsRef = useRef<Set<string>>(new Set(initialNodes.map((n) => n.id)))

  useEffect(() => {
    const needsLayout =
      graphNodes.length > 1 &&
      graphNodes.some((n) => !n.position && !positionedIdsRef.current.has(n.id))

    let nextBoxes: ZoneLayoutBox[] | null = null
    setNodes((prev) => {
      const positionById = new Map(prev.map((n) => [n.id, n.position]))
      const rebuilt = graphNodes.map((n) => {
        const flowNode = toFlowNode(n, selectedNodeId, dependencyChainIds, blastRadiusIds, colorMode, nodeSizeMode, diffStatusById, simulationTargetNodeIds)
        // Only fallback to the local ReactFlow position if the parent didn't explicitly provide one
        const position = n.position ?? positionById.get(n.id) ?? flowNode.position
        return { ...flowNode, position }
      })
      if (!needsLayout) return rebuilt
      // Some nodes have no known position anywhere — re-layout the whole
      // canvas (zone-banded or dagre) rather than leaving them scattered/
      // overlapping, matching what the manual Re-layout button does.
      const result = runLayout(rebuilt, graphNodes, graphEdges, layoutPreset, zones)
      nextBoxes = result.boxes
      return result.nodes
    })
    if (nextBoxes) setZoneBoxes(nextBoxes)

    for (const n of graphNodes) positionedIdsRef.current.add(n.id)

    if (needsLayout) {
      requestAnimationFrame(() => fitView({ padding: 0.15, duration: 400 }))
    }
  }, [graphNodes, graphEdges, selectedNodeId, dependencyChainIds, blastRadiusIds, diffStatusById, simulationTargetNodeIds, setNodes, colorMode, nodeSizeMode, layoutPreset, zones, fitView])

  useEffect(() => {
    setEdges(graphEdges.map((e) => toFlowEdge(e, Boolean(selectedNodeId), showEdgeLabels, selectedEdgeId, dependencyChainIds, blastRadiusIds, selectedNodeId, animateDataFlowEdges)))
  }, [graphEdges, selectedNodeId, setEdges, showEdgeLabels, selectedEdgeId, dependencyChainIds, blastRadiusIds, animateDataFlowEdges])

  // Auto-relayout when the layout preset changes, but not on initial mount
  // (nodes already have positions from the API or previous session).
  const prevLayoutPreset = useRef(layoutPreset)
  const hasMounted = useRef(false)
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true
      prevLayoutPreset.current = layoutPreset
      return
    }
    if (prevLayoutPreset.current === layoutPreset) return
    prevLayoutPreset.current = layoutPreset

    const result = runLayout(nodes, graphNodes, graphEdges, layoutPreset, zones)
    setNodes(result.nodes)
    setZoneBoxes(result.boxes)
    if (onNodesUpdate) {
      onNodesUpdate(result.nodes.map(fromFlowNode))
    }

    requestAnimationFrame(() => fitView({ padding: 0.15, duration: 400 }))
  }, [layoutPreset, nodes, graphNodes, graphEdges, zones, setNodes, fitView, onNodesUpdate])

  const onConnect: OnConnect = useCallback(
    (connection) => {
      const updated = addEdge(connection, edges)
      setEdges(updated)
      onEdgesUpdate?.(updated.map(fromFlowEdge))
    },
    [edges, setEdges, onEdgesUpdate],
  )

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChange(changes)
      if (onEdgesUpdate) {
        const removeIds = new Set(
          changes.filter((c) => c.type === 'remove').map((c) => c.id),
        )
        if (removeIds.size > 0) {
          onEdgesUpdate(edges.filter((e) => !removeIds.has(e.id)).map(fromFlowEdge))
        }
      }
    },
    [onEdgesChange, onEdgesUpdate, edges],
  )

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const filteredChanges = readOnly ? changes.filter((c) => c.type !== 'remove') : changes
      onNodesChange(filteredChanges)
      if (onNodesUpdate && !readOnly) {
        const removeIds = new Set(
          changes.filter((c) => c.type === 'remove').map((c) => c.id),
        )
        if (removeIds.size > 0) {
          onNodesUpdate(nodes.filter((n) => !removeIds.has(n.id)).map(fromFlowNode))
        }
      }
    },
    [onNodesChange, readOnly, onNodesUpdate, nodes],
  )

  const handleNodeDragStop = useCallback(() => {
    onNodesUpdate?.(nodes.map(fromFlowNode))
  }, [onNodesUpdate, nodes])

  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (onNodeClick) onNodeClick(node.data as unknown as GraphNodeData, event)
    },
    [onNodeClick]
  )

  const handleEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      if (!onEdgeClick) return
      const original = graphEdges.find((e) => e.id === edge.id)
      if (original) onEdgeClick(original)
    },
    [onEdgeClick, graphEdges]
  )

  const handleRelayout = useCallback(() => {
    const result = runLayout(nodes, graphNodes, graphEdges, layoutPreset, zones)
    setNodes(result.nodes)
    setZoneBoxes(result.boxes)
    if (onNodesUpdate) {
      onNodesUpdate(result.nodes.map(fromFlowNode))
    }

    requestAnimationFrame(() => fitView({ padding: 0.15, duration: 400 }))
  }, [nodes, graphNodes, graphEdges, layoutPreset, zones, setNodes, fitView, onNodesUpdate])

  return (
    <div className={`w-full h-full relative ${className}`} onDrop={onDrop} onDragOver={onDragOver}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={readOnly ? undefined : handleEdgesChange}
        onConnect={readOnly ? undefined : onConnect}
        onNodeDragStop={handleNodeDragStop}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.1 }}
        minZoom={0.2}
        maxZoom={2}
        nodesDraggable
        nodesConnectable={!readOnly}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
        style={{ background: '#F3EFE6' }}
      >
        {/* Keep the actual crossing-line grid (dots read as a different,
            less "graph paper" texture) but faded well below the original
            solid #DDD5C2 — that saturation was visually loud enough to
            compete with the nodes themselves instead of sitting behind
            them. Alpha, not a duller hex, so it stays proportionally light
            at any zoom level. */}
        <Background
          variant={BackgroundVariant.Lines}
          gap={40}
          size={1}
          color="#DDD5C255"
        />
        <ViewportPortal>
          <ZoneBandOverlay boxes={zoneBoxes} />
        </ViewportPortal>
        <Controls
          className="!bg-brand-surface !border-brand-border [&_button]:!bg-brand-surface [&_button]:!border-brand-border [&_button]:!text-white/60 [&_button:hover]:!text-white"
          showInteractive={false}
        />
        <MiniMap
          className="!bg-brand-surface !border-brand-border"
          nodeColor={(node) => {
            const data = node.data as unknown as GraphNodeData
            if (colorMode === 'health') {
              return HEALTH_COLORS[data?.health] ?? '#8A8576'
            }
            return HEALTH_COLORS[data?.health] ?? '#8A8576'
          }}
          maskColor="rgba(217, 233, 242,0.8)"
        />
      </ReactFlow>

      {showLegend && <CanvasLegend colorMode={colorMode} />}
      {selectedNodeId && (
        <ImpactLegend dependencyCount={dependencyChainIds.size} impactCount={blastRadiusIds.size} />
      )}

      {showRelayoutButton && (
        <button
          onClick={handleRelayout}
          className="absolute top-3 right-3 z-10 flex items-center gap-1.5 bg-brand-surface border border-brand-border
            rounded px-2.5 py-1.5 text-[10px] font-mono text-white/60 uppercase tracking-wider
            hover:text-white hover:border-white/30 transition-colors"
        >
          <LayoutGrid size={11} />
          Re-layout
        </button>
      )}
    </div>
  )
}

export function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  )
}
