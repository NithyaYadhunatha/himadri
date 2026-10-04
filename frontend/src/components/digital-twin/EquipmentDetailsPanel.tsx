'use client'

import { Info, LocateFixed, MapPin, X } from 'lucide-react'
import { useState } from 'react'
import { digitalTwinBridge } from '@/lib/twin/bridge'
import { EQUIPMENT_BY_ID, EQUIPMENT_DISCLAIMER, ZONE_BY_ID } from '@/lib/twin/equipment/catalog'
import { useEquipment, useEquipmentTelemetry } from '@/lib/twin/equipment/store'
import type { TelemetryStatus, ValueSource } from '@/lib/twin/equipment/telemetry'
import { ago, useNow } from './now'
import { PanelHead } from './primitives'

const STATUS: Record<TelemetryStatus, { label: string; cls: string }> = {
  model: { label: 'REGIONAL MODEL DATA', cls: 'info' },
  reference: { label: 'REFERENCE DATA', cls: 'info' },
  simulated: { label: 'SIMULATION', cls: 'demo' },
  unavailable: { label: 'DATA UNAVAILABLE', cls: 'offline' },
  none: { label: 'NO TELEMETRY CHANNELS', cls: 'offline' },
}

const SOURCE: Record<ValueSource, string> = { model: 'MODEL', reference: 'REF', simulated: 'SIM', unavailable: 'N/A' }

/** One reusable details panel for every scientific equipment type, driven by its metadata. */
export function EquipmentDetailsPanel({ caps }: { caps: string[] }) {
  const selectedId = useEquipment((s) => s.selectedId)
  const select = useEquipment((s) => s.select)
  const now = useNow()
  const telemetry = useEquipmentTelemetry(selectedId, now)
  const [about, setAbout] = useState(false)
  const def = selectedId ? EQUIPMENT_BY_ID[selectedId] : null
  if (!def || !telemetry) return null

  const zone = ZONE_BY_ID[def.zone]
  const status = STATUS[telemetry.status]
  const close = () => { select(null); digitalTwinBridge.clearEquipmentSelection() }

  return (
    <section className="tw-panel tw-eq" aria-label={`${def.name} details`}>
      <PanelHead title="Scientific equipment">
        <button className="tw-ib" style={{ width: 24, height: 24 }} aria-label="Close equipment details" onClick={close}><X size={13} /></button>
      </PanelHead>
      <div className="tw-body tw-scroll">
        <div className="tw-eq-head">
          <span className="tw-eq-swatch" style={{ background: zone?.color ?? 'var(--tw-info)' }} aria-hidden />
          <div style={{ minWidth: 0 }}>
            <h3>{def.name}</h3>
            <div className="tw-sub tw-mono">{def.shortName} · {def.category}</div>
          </div>
        </div>

        <span className={`tw-pill ${status.cls}`} style={{ marginBottom: 10 }}>{status.label}</span>

        {telemetry.rows.length > 0 ? (
          <dl className="tw-kv tw-eq-kv">
            {telemetry.rows.map((r) => (
              <div key={r.key} className="tw-eq-row">
                <dt>{r.label}</dt>
                <dd>
                  <span className={r.source === 'unavailable' ? 'tw-dimv' : 'tw-mono'}>{r.value}{r.unit && r.source !== 'unavailable' ? ` ${r.unit}` : ''}</span>
                  <span className={`tw-src ${r.source}`} title={r.source}>{SOURCE[r.source]}</span>
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="tw-sub" style={{ margin: '0 0 8px' }}>This installation has no telemetry channels in the twin.</p>
        )}

        {def.purpose && <><div className="tw-k" style={{ marginTop: 10 }}>Purpose</div><p className="tw-eq-p">{def.purpose}</p></>}
        {about && (
          <>
            {def.description && <p className="tw-eq-p">{def.description}</p>}
            <dl className="tw-kv" style={{ marginTop: 6 }}>
              <dt>Area</dt><dd>{zone?.name ?? def.zone}</dd>
              <dt>Equipment ID</dt><dd className="tw-mono">{def.id}</dd>
            </dl>
            <p className="tw-sub" style={{ margin: '8px 0 0' }}>{EQUIPMENT_DISCLAIMER}</p>
          </>
        )}

        {telemetry.notes.map((n) => <p key={n} className="tw-sub" style={{ margin: '6px 0 0' }}>{n}</p>)}
        <div className="tw-sub" style={{ marginTop: 6 }}>
          Last update: {telemetry.status === 'simulated' ? 'live (simulated)' : telemetry.updatedAt ? ago(now - telemetry.updatedAt) : '—'}
        </div>

        <div className="tw-eq-actions">
          <button className={`tw-btn ${about ? 'on' : ''}`} onClick={() => setAbout(!about)} aria-expanded={about}><Info size={11} />Details</button>
          <button className="tw-btn" disabled={!caps.includes('locateEquipment')} onClick={() => digitalTwinBridge.locateEquipment(def.id)} title="Show the route to it in 3D"><LocateFixed size={11} />Locate</button>
          <button className="tw-btn pri" disabled={!caps.includes('teleportToEquipment')} onClick={() => digitalTwinBridge.teleportToEquipment(def.id)}><MapPin size={11} />Teleport</button>
          <button className="tw-btn" onClick={close}>Close</button>
        </div>
      </div>
    </section>
  )
}
