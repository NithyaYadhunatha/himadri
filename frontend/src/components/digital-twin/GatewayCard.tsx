'use client'

import { Cpu } from 'lucide-react'
import { useTwin } from '@/lib/twin/store'
import { LINK_META, StatusPill } from './primitives'
import { PanelHead } from './primitives'
import { ago, useNow } from './now'

/** Raspberry Pi gateway. The gateway does not upload CPU/RAM/disk (the OLED reads them locally,
 *  per PolarTwinDualBoard/docs/architecture.md), so those fields say "not reported" — never invented. */
export function GatewayCard() {
  const link = useTwin((s) => s.link)
  const mode = useTwin((s) => s.mode)
  const last = useTwin((s) => s.lastDataAt)
  const now = useNow()
  const demo = mode === 'demo'
  const m = LINK_META[link]
  const gw = demo ? 'DEMO' : link === 'live' ? 'ONLINE' : link === 'backend-offline' ? 'UNKNOWN' : link === 'connecting' ? '…' : 'OFFLINE'
  const NR = <span className="tw-sub">not reported by gateway</span>

  return (
    <div className="tw-panel">
      <PanelHead title="Raspberry Pi Gateway"><Cpu size={13} color="#94A3B8" /></PanelHead>
      <div className="tw-body">
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <StatusPill s={demo ? 'normal' : m.tone} label={gw} />
          <span className="tw-sub">{demo ? 'Simulated values' : m.text}</span>
        </div>
        <dl className="tw-kv">
          <dt>Last upload</dt><dd>{last ? ago(now - last) : '—'}</dd>
          <dt>Backend link</dt><dd>{demo ? 'n/a (demo)' : link === 'backend-offline' ? 'Disconnected' : link === 'connecting' ? 'Connecting' : 'Connected'}</dd>
          <dt>Arduino</dt><dd>{demo ? 'n/a (demo)' : link === 'live' ? 'Reporting (readings flowing)' : link === 'gateway-offline' ? 'Not reporting' : '—'}</dd>
          <dt>IP / CPU / RAM</dt><dd>{NR}</dd>
          <dt>CPU temp / disk</dt><dd>{NR}</dd>
        </dl>
      </div>
    </div>
  )
}
