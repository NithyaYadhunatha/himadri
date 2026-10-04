'use client'

import { useState } from 'react'
import { CONTROLLABLE } from '@/lib/twin/config'
import { sendToggle } from '@/lib/twin/controls'
import { useTwin } from '@/lib/twin/store'
import type { CommandState } from '@/lib/twin/types'

const MSG: Record<CommandState, string> = { idle: '', sending: 'Sending…', accepted: 'Accepted', failed: 'Failed', timeout: 'Timeout' }

/** Controls for actuators only; sensors never render this. Nothing is sent until the operator clicks. */
export function AssetControlPanel({ assetId }: { assetId: string }) {
  const mode = useTwin((s) => s.mode)
  const link = useTwin((s) => s.link)
  const c = CONTROLLABLE[assetId]
  const [st, setSt] = useState<{ state: CommandState; message: string }>({ state: 'idle', message: '' })
  if (!c) return null
  const blocked = mode === 'demo' || link === 'backend-offline'

  async function go(on: boolean) {
    setSt({ state: 'sending', message: `Sending ${on ? 'ON' : 'OFF'}…` })
    setSt(await sendToggle(assetId, on))
  }

  return (
    <div className="tw-card">
      <div className="tw-k" style={{ marginBottom: 6 }}>Control</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button className="tw-btn bad" disabled={blocked || st.state === 'sending'} onClick={() => void go(true)}>ON</button>
        <button className="tw-btn pri" disabled={blocked || st.state === 'sending'} onClick={() => void go(false)}>OFF</button>
        {st.state !== 'idle' && (
          <span role="status" className="tw-sub" style={{ color: st.state === 'accepted' ? '#0F8A6A' : st.state === 'sending' ? '#7DD3FC' : '#C23B3B' }}>
            {MSG[st.state]}{st.state !== 'sending' && st.message ? ` — ${st.message}` : ''}
          </span>
        )}
      </div>
      {blocked && <div className="tw-sub" style={{ marginTop: 6 }}>{mode === 'demo' ? 'Controls are disabled in DEMO mode — no hardware is connected.' : 'Backend unreachable.'}</div>}
    </div>
  )
}
