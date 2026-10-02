'use client'

import { X } from 'lucide-react'
import { CONTROL_GROUPS } from '@/config/controls'
import { useHud } from '@/lib/twin/hud'
import { useStationStore } from '@/store/useStationStore'

export function ControlsHelp() {
  const station = useStationStore((s) => s.station)
  const open = useHud((s) => s.overlay === 'help')
  const close = useHud((s) => s.close)
  return (
    <div className={`tw-help tw-panel ${open ? 'on' : ''}`} role="dialog" aria-label="Controls" aria-hidden={!open} inert={!open}>
      <div className="tw-ph">
        <h2>Controls</h2>
        <button className="tw-ib" style={{ width: 24, height: 24 }} aria-label="Close controls" onClick={close}><X size={13} /></button>
      </div>
      <div className="tw-body">
        {CONTROL_GROUPS[station].map((g) => {
          const rows = g.rows.filter((r) => r.supported)
          if (!rows.length) return null
          return (
            <section key={g.title} className="tw-ctl-group">
              <h3 className="tw-k">{g.title}</h3>
              {rows.map((r) => (
                <div className="tw-ctl-row" key={r.action}>
                  <span className="keys">{r.keys.map((k) => <kbd key={k}>{k}</kbd>)}</span>
                  <span>{r.action}</span>
                </div>
              ))}
            </section>
          )
        })}
        <p className="tw-sub" style={{ margin: '8px 0 0' }}>Press <kbd>H</kbd> or <kbd>Esc</kbd> to close</p>
      </div>
    </div>
  )
}
