// src/components/graph/panels/GenericAssetPanel.tsx
//
// Shared detail panel used by every non-custom HIMADRI asset category
// (power, heating, water, waste, vehicle, instrument, storage, medical,
// comms, structure). Antarctic station telemetry is heterogeneous per
// category — fuel litres, freezer °C, generator kW, magnetometer nT — there
// is no fixed field vocabulary the way the old IT stack had cpu/mem/disk for
// every server-shaped thing, so this renders four generic sections instead
// of a bespoke component per category:
//   1. Identity    — what the asset is (static spec)
//   2. Live Reading — what it's doing right now
//   3. Health & Maintenance — condition trend, remaining life, failure risk
//   4. Recent Events — fault/maintenance log entries
// Field keys are humanized (camelCase -> "Camel Case") and a trailing unit
// word (Litres/C/Percent/Kw/Hours/Nt/...) is stripped into a suffix, mirroring
// the approach the original LabInstrumentPanel used for lab-instrument
// telemetry — generalized here to every category via a per-category curated
// JSON dataset (src/lib/syntheticData/<category>Data.json) with a seeded
// fallback generator for any asset id not present in the curated set.
import { useState } from 'react'
import {
  Thermometer,
  Gauge,
  Droplet,
  Zap,
  Activity,
  ShieldCheck,
  Clock,
  AlertTriangle,
  Wrench,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react'
import { PanelStat, PanelGauge, PanelSection } from './PanelStat'
import { mockStatsFor } from '@/lib/graph/mockStats'
import type { NodeTypePanelProps } from './types'

export interface GenericAssetEntry {
  identity: Record<string, string | number>
  telemetry: Record<string, string | number | boolean>
  health: {
    overall: number
    breakdown: Record<string, number>
    remainingUsefulLifeHours: number
    failureProbability7d: number
    failureProbability30d: number
    failureProbability90d: number
  }
  lastMaintenance: { date: string; type: string; actionTaken: string; technician: string; downtimeHours: number }
  recentEvents: { timestamp: string; type: string; severity: string; description: string }[]
}

const UNIT_SUFFIXES: Record<string, string> = {
  Psi: 'psi', C: '°C', Percent: '%', Hz: 'Hz', Ppm: 'ppm', Kv: 'kV',
  Mbar: 'mbar', Ul: 'µL', Mm: 'mm', V: 'V', Kw: 'kW', Litres: 'L',
  Kg: 'kg', Hours: 'h', Nt: 'nT', Kmh: 'km/h', Kpa: 'kPa', Rpm: 'rpm',
  Days: 'd', Amps: 'A', X: '', Y: '',
}

function humanizeField(key: string, value: string | number | boolean): { label: string; display: string } {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(' ')
  let unit = ''
  let labelWords = words
  const last = words[words.length - 1]
  if (Object.prototype.hasOwnProperty.call(UNIT_SUFFIXES, last)) {
    unit = UNIT_SUFFIXES[last]
    labelWords = words.slice(0, -1)
  }
  const label = labelWords.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  const display = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : `${value}${unit ? ' ' + unit : ''}`
  return { label, display }
}

function iconForField(key: string): LucideIcon {
  const k = key.toLowerCase()
  if (k.includes('temperature') || k.includes('temp')) return Thermometer
  if (k.includes('pressure') || k.includes('resolution') || k.includes('accuracy') || k.includes('load')) return Gauge
  if (k.includes('flow') || k.includes('level') || k.includes('litres') || k.includes('water')) return Droplet
  if (k.includes('voltage') || k.includes('current') || k.includes('power') || k.includes('kw') || k.includes('amps')) return Zap
  return Activity
}

function fallbackEntry(nodeId: string, label: string): GenericAssetEntry {
  const { pick } = mockStatsFor(nodeId)
  return {
    identity: { name: label, serialNumber: `SYN-${nodeId.slice(0, 8).toUpperCase()}`, lifecycleStatus: 'Active' },
    telemetry: { statusPercent: pick(60, 100) },
    health: {
      overall: pick(55, 95),
      breakdown: { mechanical: pick(55, 95), operational: pick(55, 95) },
      remainingUsefulLifeHours: pick(300, 2000),
      failureProbability7d: pick(1, 15),
      failureProbability30d: pick(5, 35),
      failureProbability90d: pick(15, 55),
    },
    lastMaintenance: { date: '—', type: 'Preventive', actionTaken: 'Routine service', technician: '—', downtimeHours: pick(1, 5) },
    recentEvents: [],
  }
}

function failureAccent(pct: number): string | undefined {
  if (pct >= 30) return '#C23B3B'
  if (pct >= 10) return '#D4820A'
  return undefined
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** Builds a NodeTypePanelProps-compatible component bound to one category's curated dataset. */
export function createGenericAssetPanel(curatedData: Record<string, GenericAssetEntry>) {
  return function GenericAssetPanel({ node }: NodeTypePanelProps) {
    const entry = curatedData[node.id] ?? fallbackEntry(node.id, node.label)
    const { identity, telemetry, health, lastMaintenance, recentEvents } = entry
    const [advancedOpen, setAdvancedOpen] = useState(false)

    return (
      <div className="space-y-4">
        <PanelSection title="Identity">
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(identity).map(([key, value]) => {
              const { label, display } = humanizeField(key, value)
              return <PanelStat key={key} icon={ShieldCheck} label={label} value={String(display)} />
            })}
          </div>
        </PanelSection>

        <PanelSection title="Live Reading">
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(telemetry).map(([key, value]) => {
              const { label, display } = humanizeField(key, value)
              return <PanelStat key={key} icon={iconForField(key)} label={label} value={String(display)} />
            })}
          </div>
        </PanelSection>

        <PanelSection title="Health & Maintenance">
          <PanelGauge label="Overall" value={Math.round(health.overall)} />
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(health.breakdown).map(([subsystem, score]) => (
              <PanelGauge key={subsystem} label={subsystem.charAt(0).toUpperCase() + subsystem.slice(1)} value={score} />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <PanelStat icon={Clock} label="Remaining Useful Life" value={`${health.remainingUsefulLifeHours.toLocaleString()} h`} />
            <PanelStat
              icon={AlertTriangle}
              label="Failure Risk (7d / 30d / 90d)"
              value={`${health.failureProbability7d}% / ${health.failureProbability30d}% / ${health.failureProbability90d}%`}
              accent={failureAccent(health.failureProbability30d)}
            />
            <PanelStat icon={Wrench} label="Last Maintenance" value={`${lastMaintenance.type} — ${lastMaintenance.date}`} />
            <PanelStat icon={Clock} label="Downtime" value={`${lastMaintenance.downtimeHours} h`} />
          </div>
        </PanelSection>

        {recentEvents.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex items-center gap-1.5 font-mono text-[10px] text-white/40 uppercase tracking-widest hover:text-white/70 transition-colors"
            >
              <ChevronDown size={12} className={`transition-transform ${advancedOpen ? 'rotate-0' : '-rotate-90'}`} />
              Recent Events
            </button>
            {advancedOpen && (
              <div className="mt-2 space-y-1.5">
                {recentEvents.map((e, i) => (
                  <div key={i} className="bg-brand-bg border border-brand-border rounded p-2 flex items-start gap-2">
                    <span
                      className="font-mono text-[9px] uppercase tracking-wide shrink-0 w-16"
                      style={{ color: e.severity === 'CRITICAL' ? '#C23B3B' : e.severity === 'WARNING' ? '#D4820A' : '#8A8576' }}
                    >
                      {e.severity}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-sans text-xs text-white/70">{e.description}</p>
                      <p className="font-mono text-[9px] text-white/30 mt-0.5">{formatTimestamp(e.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }
}
