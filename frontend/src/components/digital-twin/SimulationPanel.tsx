'use client'

import { Pause, Play, RotateCcw, Square } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ROOMS } from '@/lib/twin/config'
import { SIM_RAMP_MS, simControls, type SimVariable } from '@/lib/twin/demo'
import { useTwin } from '@/lib/twin/store'
import { Field, PanelHead, Tabs } from './primitives'
import { useNow } from './now'

type SimTab = 'thermal' | 'environment' | 'electrical' | 'safety'

const VARS: Record<Exclude<SimTab, 'electrical'>, { id: SimVariable; label: string }[]> = {
  thermal: [{ id: 'temperature', label: 'Temperature' }, { id: 'humidity', label: 'Humidity' }],
  environment: [{ id: 'temperature', label: 'Temperature' }, { id: 'humidity', label: 'Humidity' }, { id: 'gas', label: 'Gas / smoke level' }],
  safety: [{ id: 'occupancy', label: 'Occupancy (IR)' }, { id: 'proximity', label: 'Obstacle / proximity' }, { id: 'gas', label: 'Gas alert' }],
}

/** Scenario injector over the DEMO data source. There is no physics engine behind this panel:
 *  it ramps one variable toward a stressed value so alerts, charts, KPIs and the 3D overlay can be rehearsed. */
export function SimulationPanel() {
  const mode = useTwin((s) => s.mode)
  const setMode = useTwin((s) => s.setMode)
  const now = useNow()
  const [tab, setTab] = useState<SimTab>('thermal')
  const [variable, setVariable] = useState<SimVariable>('temperature')
  const [roomId, setRoomId] = useState('all')
  const [, force] = useState(0)
  const rerender = () => force((n) => n + 1)
  const status = simControls.status
  const prog = simControls.progress(now)

  // Leaving DEMO mode must not leave a scenario armed.
  useEffect(() => { if (mode !== 'demo') simControls.stop() }, [mode])

  function start() {
    if (mode !== 'demo') setMode('demo')
    simControls.start({ variable, roomId })
    rerender()
  }
  const vars = tab === 'electrical' ? [] : VARS[tab]

  return (
    <div className="tw-panel">
      <PanelHead title="Simulations">{mode === 'demo' ? <span className="tw-pill demo">DEMO</span> : <span className="tw-sub">starts DEMO mode</span>}</PanelHead>
      <Tabs<SimTab> value={tab} onChange={(t) => { setTab(t); if (t !== 'electrical') setVariable(VARS[t][0].id); simControls.stop(); rerender() }} items={[
        { id: 'thermal', label: 'THERMAL' }, { id: 'environment', label: 'ENVIRON.' },
        { id: 'electrical', label: 'ELECTRICAL', disabled: true, title: 'No power / load metering exists on the rig, so there is nothing to simulate yet' },
        { id: 'safety', label: 'SAFETY' },
      ]} />
      <div className="tw-body">
        <Field label="Variable">
          <select className="tw-sel" value={variable} onChange={(e) => { setVariable(e.target.value as SimVariable); simControls.stop(); rerender() }} disabled={status !== 'stopped'}>
            {vars.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="Room">
          <select className="tw-sel" value={roomId} onChange={(e) => setRoomId(e.target.value)} disabled={status !== 'stopped'}>
            <option value="all">All rooms</option>
            {ROOMS.map((r) => <option key={r.id} value={r.id}>{r.short} · {r.name}</option>)}
          </select>
        </Field>
        <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
          {status === 'running'
            ? <button className="tw-btn" onClick={() => { simControls.pause(); rerender() }}><Pause size={11} />Pause</button>
            : <button className="tw-btn pri" onClick={() => { if (status === 'paused') simControls.resume(); else start(); rerender() }}><Play size={11} />{status === 'paused' ? 'Resume' : 'Start'}</button>}
          <button className="tw-btn" disabled={status === 'stopped'} onClick={() => { simControls.stop(); rerender() }}><Square size={11} />Stop</button>
          <button className="tw-btn" disabled={status === 'stopped'} onClick={() => { simControls.reset(); rerender() }}><RotateCcw size={11} />Reset</button>
        </div>
        <div className="tw-k">Scenario · {status}</div>
        <div style={{ height: 6, borderRadius: 3, background: 'rgba(8,3,48,.12)', overflow: 'hidden', margin: '4px 0' }}>
          <div style={{ width: `${prog * 100}%`, height: '100%', background: '#1D1C93', transition: 'width 1s linear' }} />
        </div>
        <div className="tw-sub">Ramps the variable to a stressed value over {SIM_RAMP_MS / 1000}s. Scenario injection on demo data — not a physics model, and it never sends commands to hardware.</div>
      </div>
    </div>
  )
}
