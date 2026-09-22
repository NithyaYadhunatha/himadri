// src/lib/graph/mockLogs.ts
//
// Seeded-per-node mock log stream for the per-node Logs popup (NodeCard).
// No backend log-streaming endpoint exists yet — deterministic via
// mockStatsFor (same convention as mockStats.ts) so a given node always
// shows the same log history across re-renders/refreshes instead of a
// fresh random set every time the popup opens.

import { mockStatsFor } from './mockStats'

export type LogLevel = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL'

export interface MockLogEntry {
  id: string
  timestamp: string // ISO
  level: LogLevel
  message: string
}

const MESSAGE_TEMPLATES: Array<{ level: LogLevel; message: string }> = [
  { level: 'INFO', message: 'Heartbeat received' },
  { level: 'INFO', message: 'Health check passed' },
  { level: 'INFO', message: 'Metric collection completed' },
  { level: 'INFO', message: 'Scheduled backup completed successfully' },
  { level: 'INFO', message: 'Configuration reload completed' },
  { level: 'INFO', message: 'Node health score recalculated' },
  { level: 'WARNING', message: 'CPU utilization above 75% for 5 minutes' },
  { level: 'WARNING', message: 'Memory usage trending upward' },
  { level: 'WARNING', message: 'Connection pool nearing capacity' },
  { level: 'WARNING', message: 'Response time degraded (over 500ms)' },
  { level: 'ERROR', message: 'Failed to reach downstream dependency, retrying' },
  { level: 'ERROR', message: 'Request timeout on outbound call' },
  { level: 'CRITICAL', message: 'Service restarted after unresponsive health check' },
]

/** Deterministic mock log history for a node, newest first. */
export function mockLogsFor(nodeId: string, count = 18): MockLogEntry[] {
  const { pick } = mockStatsFor(nodeId)
  let cursor = Date.now()

  const entries: MockLogEntry[] = []
  for (let i = 0; i < count; i++) {
    cursor -= pick(30, 900) * 1000 // 30s–15min apart
    const template = MESSAGE_TEMPLATES[pick(0, MESSAGE_TEMPLATES.length - 1)]
    entries.push({
      id: `${nodeId}-log-${i}`,
      timestamp: new Date(cursor).toISOString(),
      level: template.level,
      message: template.message,
    })
  }
  return entries
}
