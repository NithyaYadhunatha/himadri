// src/components/nodes/NodeLogsModal.tsx
//
// Per-node logs popup, opened from the "Logs" button on each NodeCard.
// Dummy data — no backend log-streaming endpoint exists yet (the Mongo
// ActivityLog model is a generic admin-action audit trail, not a per-node
// health/system log, and is admin-gated — see /api/logs). Seeded per node
// id via mockLogsFor, so a given node's logs stay stable across opens.
'use client'

import { CenteredModal } from '@/components/ui/CenteredModal'
import { mockLogsFor, type LogLevel } from '@/lib/graph/mockLogs'

const LEVEL_COLOR: Record<LogLevel, string> = {
  INFO: '#626079',
  WARNING: '#D4820A',
  ERROR: '#C23B3B',
  CRITICAL: '#C23B3B',
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

interface NodeLogsModalProps {
  nodeId: string
  nodeName: string
  open: boolean
  onClose: () => void
}

export function NodeLogsModal({ nodeId, nodeName, open, onClose }: NodeLogsModalProps) {
  const logs = open ? mockLogsFor(nodeId) : []

  return (
    <CenteredModal open={open} onClose={onClose} title={`${nodeName} — Logs`} subtitle="Recent node activity" width="w-full max-w-[560px]">
      <div className="divide-y divide-brand-border">
        {logs.map((log) => (
          <div key={log.id} className="px-4 py-2 flex items-start gap-3">
            <span className="font-mono text-[10px] text-white/30 shrink-0 w-[128px]">{formatTimestamp(log.timestamp)}</span>
            <span
              className="font-mono text-[9px] uppercase tracking-wide shrink-0 w-[64px]"
              style={{ color: LEVEL_COLOR[log.level] }}
            >
              {log.level}
            </span>
            <span className="font-sans text-xs text-white/70 flex-1">{log.message}</span>
          </div>
        ))}
      </div>
    </CenteredModal>
  )
}
