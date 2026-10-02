'use client'

import { digitalTwinBridge } from '@/lib/twin/bridge'
import { FRESHNESS } from '@/lib/twin/config'
import { useTwin } from '@/lib/twin/store'
import { PanelHead } from './primitives'

export function SettingsPanel({ caps }: { caps: string[] }) {
  const mode = useTwin((s) => s.mode)
  const setMode = useTwin((s) => s.setMode)
  const reset = useTwin((s) => s.reset)
  return (
    <div className="tw-panel">
      <PanelHead title="Settings" />
      <div className="tw-body">
        <div className="tw-k" style={{ marginBottom: 4 }}>Data source</div>
        <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
          <button className={`tw-btn ${mode === 'live' ? 'on' : ''}`} onClick={() => setMode('live')}>LIVE</button>
          <button className={`tw-btn ${mode === 'demo' ? 'on' : ''}`} onClick={() => setMode('demo')}>DEMO</button>
          <button className="tw-btn" onClick={reset}>Clear history</button>
        </div>
        <dl className="tw-kv">
          <dt>Stale after</dt><dd>{FRESHNESS.staleMs / 1000}s without a reading</dd>
          <dt>Poll fallback</dt><dd>every {FRESHNESS.pollMs / 1000}s (only when the socket is silent)</dd>
          <dt>3D bridge</dt><dd>{caps.length ? `${caps.length} commands: ${caps.join(', ')}` : 'not detected in the loaded Unity build'}</dd>
          <dt>Thresholds</dt><dd>Status comes from the backend; chart reference lines are configurable demo values in lib/twin/config.ts, not safety standards.</dd>
        </dl>
        {!caps.length && <div className="tw-sub" style={{ marginTop: 8 }}>See docs/unity/README.md to add WebBridge to the Unity project.</div>}
        <button className="tw-btn" style={{ marginTop: 8 }} onClick={() => digitalTwinBridge.resetCamera()}>Reset 3D camera</button>
      </div>
    </div>
  )
}
