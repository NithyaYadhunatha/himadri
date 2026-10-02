'use client'

import { Activity, Bell, Box, Camera, FlaskConical, Layers, Settings, SlidersHorizontal, BarChart3 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTwin, type RightTab } from '@/lib/twin/store'

function IB({ icon, label, active, onClick, badge }: { icon: ReactNode; label: string; active?: boolean; onClick: () => void; badge?: number }) {
  return (
    <button className="tw-ib" aria-pressed={!!active} aria-label={label} onClick={onClick}>
      {icon}<span className="tip">{label}</span>
      {!!badge && <span className="badge">{badge > 9 ? '9+' : badge}</span>}
    </button>
  )
}

export function TwinToolbar({ showCamera, onCamera }: { showCamera: boolean; onCamera: () => void }) {
  const panel = useTwin((s) => s.panel)
  const setPanel = useTwin((s) => s.setPanel)
  const unacked = useTwin((s) => s.alerts.filter((a) => !a.acknowledged).length)
  const toggle = (p: RightTab) => setPanel(panel === p ? null : p)
  const s = 15
  return (
    <nav className="tw-panel tw-rail" aria-label="Digital twin tools">
      <span className="lbl">MAIN</span>
      <IB icon={<Box size={s} />} label="Digital twin (hide panels)" active={panel === null} onClick={() => setPanel(null)} />
      <IB icon={<SlidersHorizontal size={s} />} label="Configuration" active={panel === 'configure'} onClick={() => toggle('configure')} />
      <IB icon={<BarChart3 size={s} />} label="Analytics" active={panel === 'analytics'} onClick={() => toggle('analytics')} />
      <IB icon={<Activity size={s} />} label="Live telemetry" active={panel === 'telemetry'} onClick={() => toggle('telemetry')} />
      <IB icon={<Bell size={s} />} label="Alerts" active={panel === 'alerts'} onClick={() => toggle('alerts')} badge={unacked} />
      <div className="sep" />
      <span className="lbl">VIEW</span>
      <IB icon={<Camera size={s} />} label="Camera" active={showCamera} onClick={onCamera} />
      <IB icon={<FlaskConical size={s} />} label="Simulation" active={panel === 'simulation'} onClick={() => toggle('simulation')} />
      <IB icon={<Layers size={s} />} label="Layers & heat map" active={panel === 'layers'} onClick={() => toggle('layers')} />
      <IB icon={<Settings size={s} />} label="Settings" active={panel === 'settings'} onClick={() => toggle('settings')} />
    </nav>
  )
}
