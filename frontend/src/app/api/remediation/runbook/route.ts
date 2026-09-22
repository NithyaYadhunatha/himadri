// src/app/api/remediation/runbook/route.ts
//
// Returns a runbook for a given remediation action. Steps are derived from
// the actionId pattern set by the recommendations route — no backend
// equivalent exists, so this is computed here. Auth-gated to any active member.
//
// Query: ?actionId=<string>
// Response: { title: string; steps: string[] }

import { NextResponse } from 'next/server'
import { getCurrentMembership } from '@/lib/auth/rbac'

function buildRunbook(actionId: string): { title: string; steps: string[] } {
  const id = actionId.toLowerCase()

  if (id.includes('emergency') || (id.includes('restart') && id.includes('emergency'))) {
    return {
      title: 'Emergency Service Restart',
      steps: [
        'Notify stakeholders of planned emergency restart (Slack / email)',
        'Check current process list: ps aux | grep <service>',
        'Drain active connections — allow 30 s for graceful shutdown',
        'Stop service: systemctl stop <service>',
        'Remove any stale PID or lock files',
        'Start service: systemctl start <service>',
        'Verify startup: systemctl status <service>',
        'Monitor health score for 2 min to confirm recovery',
        'Notify stakeholders once service is restored',
      ],
    }
  }

  if (id.includes('restart')) {
    return {
      title: 'Service Restart',
      steps: [
        'Verify no critical batch jobs are in progress',
        'Drain active connections (30 s timeout)',
        'Stop service: systemctl stop <service>',
        'Clear stale PID files if present',
        'Start service: systemctl start <service>',
        'Confirm service is running: systemctl status <service>',
        'Monitor health score for 2 min',
      ],
    }
  }

  if (id.includes('memory') || id.includes('cache')) {
    return {
      title: 'Memory Cache Clear',
      steps: [
        'Identify top memory consumers: top -o %MEM -n 1',
        'Flush application-level cache via management endpoint or CLI',
        'Trigger JVM / runtime garbage collection if applicable',
        'Drop OS page cache (Linux): sync && echo 3 > /proc/sys/vm/drop_caches',
        'Verify memory headroom restored: free -h',
        'Monitor for recurrence over 5 min',
      ],
    }
  }

  if (id.includes('cpu') || id.includes('load')) {
    return {
      title: 'CPU Load Reduction',
      steps: [
        'Identify runaway processes: top -o %CPU -n 1',
        'Check for unexpected scheduled jobs (crontab -l)',
        'Review thread pool and connection pool configuration',
        'Terminate or renice high-CPU processes if safe',
        'Rebalance upstream load balancer if applicable',
        'Monitor CPU usage over 5 min to confirm reduction',
      ],
    }
  }

  if (id.includes('disk') || id.includes('archive')) {
    return {
      title: 'Disk Space Recovery',
      steps: [
        'Identify large consumers: du -sh /* | sort -rh | head -20',
        'Compress log files older than 7 days: gzip /var/log/*.log.*',
        'Archive or delete audit logs beyond retention policy',
        'Clear application temp and cache directories',
        'Confirm reclaimed space: df -h',
        'Enable log rotation if not already configured',
      ],
    }
  }

  if (id.includes('isolate')) {
    return {
      title: 'Node Isolation',
      steps: [
        'Identify upstream load balancers and service registries',
        'Remove node from load balancer rotation',
        'Verify all traffic has drained (check access logs)',
        'Apply host-based firewall rules to block inbound app traffic',
        'Investigate root cause while node is isolated',
        'Resolve the issue and verify health ≥ 80 before re-introduction',
        'Re-add node to load balancer rotation',
        'Monitor for 5 min post-reintroduction',
      ],
    }
  }

  if (id.includes('failover')) {
    return {
      title: 'Failover to Standby',
      steps: [
        'Confirm standby instance is healthy and data is in sync',
        'Initiate failover via load balancer or service registry',
        'Verify traffic is flowing to standby (check dashboards)',
        'Monitor standby health score for 5 min',
        'Investigate root cause on the original primary',
        'Plan failback after primary is repaired and validated',
      ],
    }
  }

  // Generic fallback
  return {
    title: 'Remediation Runbook',
    steps: [
      'Assess current system health and active alerts',
      'Identify the root cause of degradation',
      'Execute the recommended remediation action',
      'Monitor health score for at least 5 min post-action',
      'Escalate to a senior engineer if health does not improve',
      'Document findings and resolution steps in the incident log',
    ],
  }
}

export async function GET(req: Request) {
  const membership = await getCurrentMembership()
  if (!membership) {
    return NextResponse.json({ error: 'Membership not active' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const actionId = searchParams.get('actionId')?.trim()

  if (!actionId) {
    return NextResponse.json({ error: 'actionId is required' }, { status: 400 })
  }

  const runbook = buildRunbook(actionId)
  return NextResponse.json(runbook)
}
