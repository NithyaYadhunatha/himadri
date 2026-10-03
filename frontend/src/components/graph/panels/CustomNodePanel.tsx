// src/components/graph/panels/CustomNodePanel.tsx
//
// Custom (user-created) asset panel. A custom asset has no fixed telemetry
// vocabulary and no curated dataset, so this shows only what the asset
// record itself actually carries (metadata bag + subtype) rather than
// fabricating stats. Previously pulled a PRD summary from the since-removed
// NodeBusinessMeta model (revenue/SLA business metadata dropped entirely
// from HIMADRI, see lib/backendAdapters.ts's header comment) — that
// dependency is gone, so this now just renders node.metadata generically.
import { FileText } from 'lucide-react'
import { PanelSection, PanelStat } from './PanelStat'
import type { NodeTypePanelProps } from './types'

export function CustomNodePanel({ node }: NodeTypePanelProps) {
  const metadataEntries = Object.entries(node.metadata ?? {})

  return (
    <div className="space-y-4">
      <PanelSection title="Asset Details">
        <div className="grid grid-cols-2 gap-2">
          {node.subtype && <PanelStat icon={FileText} label="Subtype" value={node.subtype} />}
          {metadataEntries.map(([key, value]) => (
            <PanelStat key={key} icon={FileText} label={key} value={String(value)} />
          ))}
        </div>
        {!node.subtype && metadataEntries.length === 0 && (
          <p className="text-[10px] font-mono text-white/55 italic">
            No additional details recorded for this custom asset yet.
          </p>
        )}
      </PanelSection>
    </div>
  )
}
