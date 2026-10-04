'use client'

import { ChevronDown, ChevronUp, LocateFixed, MapPin } from 'lucide-react'
import { useMemo, useState } from 'react'
import { STATION_LABELS, STATIONS } from '@/lib/constants'
import { digitalTwinBridge } from '@/lib/twin/bridge'
import { EQUIPMENT, EQUIPMENT_ZONES } from '@/lib/twin/equipment/catalog'
import { useEquipment } from '@/lib/twin/equipment/store'
import { useTwin } from '@/lib/twin/store'
import { useStationStore } from '@/store/useStationStore'
import { Field, LINK_META, PanelHead, StatusPill } from './primitives'

export function BharatiConfigurator({ caps }: { caps: string[] }) {
  const [open, setOpen] = useState(true)
  const selectedId = useEquipment((s) => s.selectedId)
  const selectEquipment = useEquipment((s) => s.select)
  const initialZone = EQUIPMENT_ZONES[0]?.id ?? ''
  const selectedDef = EQUIPMENT.find((e) => e.id === selectedId)
  const [zoneId, setZoneId] = useState(selectedDef?.zone ?? initialZone)
  const visibleZoneId = selectedDef?.zone ?? zoneId
  const equipment = useMemo(() => EQUIPMENT.filter((e) => e.zone === visibleZoneId), [visibleZoneId])
  const station = useStationStore((s) => s.station)
  const canSwitch = useStationStore((s) => s.canSwitch)
  const setStation = useStationStore((s) => s.setStation)
  const mode = useTwin((s) => s.mode)
  const setMode = useTwin((s) => s.setMode)
  const link = useTwin((s) => s.link)

  const pick = (id: string) => {
    selectEquipment(id || null)
    if (id) digitalTwinBridge.send({ type: 'selectEquipment', equipmentId: id })
    else digitalTwinBridge.clearEquipmentSelection()
  }

  return (
    <section className="tw-panel" aria-label="Bharati station navigator">
      <PanelHead title="Bharati equipment navigator">
        <StatusPill s={mode === 'demo' ? 'normal' : LINK_META[link].tone} label={mode === 'demo' ? 'DEMO' : LINK_META[link].label} />
        <button className="tw-ib" style={{ width: 24, height: 24 }} aria-label={open ? 'Collapse navigator' : 'Expand navigator'} onClick={() => setOpen(!open)}>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </PanelHead>
      {open && (
        <div className="tw-body">
          <Field label="Station">
            <select className="tw-sel" value={station} disabled={!canSwitch} onChange={(e) => setStation(e.target.value as typeof station)}>
              {STATIONS.map((s) => <option key={s} value={s}>{STATION_LABELS[s]}</option>)}
            </select>
          </Field>
          <Field label="Scientific area">
            <select className="tw-sel" value={visibleZoneId} onChange={(e) => { setZoneId(e.target.value); pick('') }}>
              {EQUIPMENT_ZONES.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </Field>
          <Field label="Equipment">
            <select className="tw-sel" value={selectedId && equipment.some((e) => e.id === selectedId) ? selectedId : ''} onChange={(e) => pick(e.target.value)}>
              <option value="">Select equipment…</option>
              {equipment.map((e) => <option key={e.id} value={e.id}>{e.shortName} — {e.name}</option>)}
            </select>
          </Field>
          <div className="tw-eq-actions" style={{ marginTop: 4 }}>
            <button className="tw-btn" disabled={!selectedId || !caps.includes('locateEquipment')} onClick={() => selectedId && digitalTwinBridge.locateEquipment(selectedId)}><LocateFixed size={11} />Locate</button>
            <button className="tw-btn pri" disabled={!selectedId || !caps.includes('teleportToEquipment')} onClick={() => selectedId && digitalTwinBridge.teleportToEquipment(selectedId)}><MapPin size={11} />Teleport</button>
          </div>
          <Field label="Data mode">
            <div style={{ display: 'flex', gap: 5 }}>
              <button className={`tw-btn ${mode === 'live' ? 'on' : ''}`} onClick={() => mode !== 'live' && setMode('live')}>LIVE</button>
              <button className={`tw-btn ${mode === 'demo' ? 'on' : ''}`} onClick={() => mode !== 'demo' && setMode('demo')}>DEMO</button>
            </div>
          </Field>
          <p className="tw-sub" style={{ margin: '8px 0 0' }}>Bharati navigation follows scientific areas and equipment. Building rooms remain available in the in-scene Navigate menu (Tab).</p>
        </div>
      )}
    </section>
  )
}
