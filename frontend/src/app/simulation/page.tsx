'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { Zap, Play, GitCompare, X, Plus, Trash2, Fuel, Wheat, IndianRupee, Cloud, MessageCircle, Send, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { InlineLoader, EmptyState } from '@/components/ui/Loader'
import {
  scenarioService,
  type ScenarioPreset,
  type ScenarioResult,
  type ScenarioInputs,
  type FailureEvent,
} from '@/services/scenario.service'
import { parsePromptToScenario } from '@/lib/nlScenarioParser'
import { useStationStore } from '@/store/useStationStore'
import type { BadgeVariant } from '@/types/common'

const inputClass = 'w-full bg-brand-bg border border-brand-border rounded px-2.5 py-1.5 text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-cyan/60 font-mono'

const FAILURE_EVENT_TYPES: Array<{ value: FailureEvent['type']; label: string }> = [
  { value: 'generator_failure', label: 'Generator Failure' },
  { value: 'convoy_stranded', label: 'Convoy Stranded' },
  { value: 'medevac_convoy', label: 'Medevac Convoy' },
  { value: 'storm_onset', label: 'Storm Onset' },
]

function verdictVariant(verdict: string | null): BadgeVariant {
  const v = (verdict ?? '').toLowerCase()
  if (v.includes('fail')) return 'critical'
  return 'healthy'
}

function DarkTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name?: string; color?: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#F7FBFDfa] border border-brand-border rounded-lg px-3 py-2 shadow-lg backdrop-blur-sm">
      <p className="font-mono text-[10px] text-ink/50 mb-1">Day {label}</p>
      {payload.map((p, i) => (
        <p key={i} className="font-mono text-xs" style={{ color: p.color ?? '#1868A0' }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
        </p>
      ))}
    </div>
  )
}

// ─── Result detail (latest / selected run) ─────────────────────────────────

function CostBreakdownBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.max((value / total) * 100, value > 0 ? 2 : 0) : 0
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-[10px] text-white/50 uppercase tracking-wider">{label}</span>
        <span className="font-mono text-[10px] text-white/70">₹{(value / 100000).toFixed(2)}L</span>
      </div>
      <div className="h-1.5 rounded-full bg-brand-bg overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

function ScenarioDetailPanel({ result }: { result: ScenarioResult }) {
  const outputs = result.outputs
  const cost = outputs?.cost_inr

  return (
    <div className="bg-brand-surface border border-brand-border rounded p-4 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <p className="text-sm font-sans font-semibold text-white">{result.name}</p>
          <p className="font-mono text-[10px] text-white/30 mt-0.5">
            {result.station_id.toUpperCase()} · {result.horizon_days}d horizon · {new Date(result.created_at).toLocaleString()}
          </p>
        </div>
        <Badge variant={verdictVariant(result.survivability_verdict)} size="md">
          {result.survivability_verdict ?? 'unknown'}
        </Badge>
      </div>

      {result.first_failure_at_day !== null && (
        <div className="bg-crimson/10 border border-crimson/30 rounded p-2.5">
          <p className="text-[11px] font-mono text-crimson">
            First failure at day {result.first_failure_at_day}: {result.first_failure_cause}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-brand-bg border border-brand-border rounded p-2.5">
          <p className="font-mono text-[9px] text-white/40 uppercase flex items-center gap-1"><Fuel size={10} /> Fuel Endurance</p>
          <p className="font-mono text-base text-white mt-0.5">{result.fuel_endurance_days ?? '—'} <span className="text-[10px] text-white/30">days</span></p>
        </div>
        <div className="bg-brand-bg border border-brand-border rounded p-2.5">
          <p className="font-mono text-[9px] text-white/40 uppercase flex items-center gap-1"><Wheat size={10} /> Food Endurance</p>
          <p className="font-mono text-base text-white mt-0.5">{result.food_endurance_days ?? '—'} <span className="text-[10px] text-white/30">days</span></p>
        </div>
        <div className="bg-brand-bg border border-brand-border rounded p-2.5">
          <p className="font-mono text-[9px] text-white/40 uppercase flex items-center gap-1"><IndianRupee size={10} /> Total Cost</p>
          <p className="font-mono text-base text-white mt-0.5">₹{result.cost_inr != null ? (result.cost_inr / 100000).toFixed(1) : '—'}<span className="text-[10px] text-white/30">L</span></p>
        </div>
        <div className="bg-brand-bg border border-brand-border rounded p-2.5">
          <p className="font-mono text-[9px] text-white/40 uppercase flex items-center gap-1"><Cloud size={10} /> Carbon</p>
          <p className="font-mono text-base text-white mt-0.5">{result.carbon_kg_co2e != null ? (result.carbon_kg_co2e / 1000).toFixed(1) : '—'}<span className="text-[10px] text-white/30">t CO2e</span></p>
        </div>
      </div>

      {cost && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
          <CostBreakdownBar label="Fuel" value={cost.fuel} total={cost.total} color="#1868A0" />
          <CostBreakdownBar label="Logistics" value={cost.logistics} total={cost.total} color="#6E7FCE" />
          <CostBreakdownBar label="Spares" value={cost.spares} total={cost.total} color="#B8720F" />
          <CostBreakdownBar label="Avoided Failure" value={cost.avoided_failure} total={cost.total} color="#B23A2E" />
        </div>
      )}

      {outputs && outputs.timeline.length > 0 && (
        <div>
          <p className="font-mono text-[10px] text-white/40 uppercase tracking-widest mb-2">Fuel &amp; Food Projection</p>
          <ResponsiveContainer width="100%" height={220} minWidth={0} minHeight={0}>
            <LineChart data={outputs.timeline} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#B9D6E655" />
              <XAxis dataKey="day" tick={{ fill: '#16283A66', fontSize: 9, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} tickFormatter={(d: number) => `D${d}`} />
              <YAxis yAxisId="fuel" tick={{ fill: '#1868A099', fontSize: 9, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
              <YAxis yAxisId="food" orientation="right" tick={{ fill: '#1F9E6D99', fontSize: 9, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
              <Tooltip content={<DarkTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'var(--font-mono)' }} />
              {result.first_failure_at_day !== null && (
                <ReferenceLine yAxisId="fuel" x={result.first_failure_at_day} stroke="#B23A2E" strokeDasharray="4 4" label={{ value: 'FAILURE', fontSize: 9, fill: '#B23A2E', position: 'top' }} />
              )}
              <Line yAxisId="fuel" type="monotone" dataKey="fuel_liters" name="Fuel (L)" stroke="#1868A0" strokeWidth={2} dot={false} />
              <Line yAxisId="food" type="monotone" dataKey="food_days_left" name="Food (days)" stroke="#1F9E6D" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ─── Compact past-run card ──────────────────────────────────────────────────

function ResultCard({ result, selected, onToggleCompare, onSelect }: { result: ScenarioResult; selected: boolean; onToggleCompare: () => void; onSelect: () => void }) {
  return (
    <div className={`bg-brand-surface border rounded p-3 transition-colors cursor-pointer ${selected ? 'border-cyan/50' : 'border-brand-border hover:border-white/20'}`} onClick={onSelect}>
      <div className="flex items-start justify-between mb-2 gap-2">
        <div className="min-w-0">
          <p className="text-xs font-sans font-semibold text-white truncate">{result.name}</p>
          <p className="font-mono text-[9px] text-white/30 mt-0.5">{result.station_id.toUpperCase()} · {new Date(result.created_at).toLocaleDateString()}</p>
        </div>
        <Badge variant={verdictVariant(result.survivability_verdict)} size="sm">{result.survivability_verdict ?? '—'}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="font-mono text-[10px] text-white/50">Fuel <span className="text-white">{result.fuel_endurance_days ?? '—'}d</span></div>
        <div className="font-mono text-[10px] text-white/50">Food <span className="text-white">{result.food_endurance_days ?? '—'}d</span></div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onToggleCompare() }}
        className={`text-[9px] font-mono uppercase tracking-wider px-2 py-1 rounded border transition-colors ${selected ? 'border-cyan/50 text-cyan bg-cyan/10' : 'border-brand-border text-white/40 hover:text-white'}`}
      >
        {selected ? 'Selected for compare' : 'Select to compare'}
      </button>
    </div>
  )
}

// ─── Custom scenario builder ────────────────────────────────────────────────

function CustomBuilder({ inputs, onChange, horizonDays, onHorizonDays }: {
  inputs: ScenarioInputs
  onChange: (inputs: ScenarioInputs) => void
  horizonDays: number
  onHorizonDays: (days: number) => void
}) {
  const [fuelDeliveryEnabled, setFuelDeliveryEnabled] = useState(Boolean(inputs.fuel_delivery))

  const addFailureEvent = () => {
    onChange({ ...inputs, failure_events: [...(inputs.failure_events ?? []), { day: 10, type: 'generator_failure' }] })
  }
  const updateFailureEvent = (i: number, patch: Partial<FailureEvent>) => {
    const next = [...(inputs.failure_events ?? [])]
    next[i] = { ...next[i], ...patch }
    onChange({ ...inputs, failure_events: next })
  }
  const removeFailureEvent = (i: number) => {
    onChange({ ...inputs, failure_events: (inputs.failure_events ?? []).filter((_, idx) => idx !== i) })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="font-mono text-[9px] text-white/40 uppercase tracking-wider mb-1 block">Headcount</label>
          <input type="number" min={1} max={80} className={inputClass} value={inputs.headcount ?? 25}
            onChange={(e) => onChange({ ...inputs, headcount: Number(e.target.value) })} />
        </div>
        <div>
          <label className="font-mono text-[9px] text-white/40 uppercase tracking-wider mb-1 block">Generator Avail. %</label>
          <input type="number" min={0} max={100} className={inputClass} value={inputs.generator_availability_pct ?? 100}
            onChange={(e) => onChange({ ...inputs, generator_availability_pct: Number(e.target.value) })} />
        </div>
        <div>
          <label className="font-mono text-[9px] text-white/40 uppercase tracking-wider mb-1 block">Weather Severity (1-5)</label>
          <input type="number" min={1} max={5} className={inputClass} value={inputs.weather_severity ?? 1}
            onChange={(e) => onChange({ ...inputs, weather_severity: Math.min(5, Math.max(1, Number(e.target.value))) })} />
        </div>
        <div>
          <label className="font-mono text-[9px] text-white/40 uppercase tracking-wider mb-1 block">Horizon (days)</label>
          <input type="number" min={7} max={365} className={inputClass} value={horizonDays}
            onChange={(e) => onHorizonDays(Number(e.target.value))} />
        </div>
      </div>

      <div className="border-t border-brand-border pt-3">
        <label className="flex items-center gap-2 mb-2 cursor-pointer">
          <input type="checkbox" className="accent-cyan" checked={fuelDeliveryEnabled} onChange={(e) => {
            setFuelDeliveryEnabled(e.target.checked)
            onChange({ ...inputs, fuel_delivery: e.target.checked ? { day: 30, litres: 20000 } : null })
          }} />
          <span className="font-mono text-[10px] text-white/60 uppercase tracking-wider">Scheduled Fuel Delivery</span>
        </label>
        {fuelDeliveryEnabled && (
          <div className="grid grid-cols-2 gap-3 pl-6">
            <div>
              <label className="font-mono text-[9px] text-white/40 uppercase tracking-wider mb-1 block">Day</label>
              <input type="number" min={0} max={horizonDays} className={inputClass} value={inputs.fuel_delivery?.day ?? 30}
                onChange={(e) => onChange({ ...inputs, fuel_delivery: { day: Number(e.target.value), litres: inputs.fuel_delivery?.litres ?? 20000 } })} />
            </div>
            <div>
              <label className="font-mono text-[9px] text-white/40 uppercase tracking-wider mb-1 block">Litres</label>
              <input type="number" min={0} className={inputClass} value={inputs.fuel_delivery?.litres ?? 20000}
                onChange={(e) => onChange({ ...inputs, fuel_delivery: { day: inputs.fuel_delivery?.day ?? 30, litres: Number(e.target.value) } })} />
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-brand-border pt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-[10px] text-white/60 uppercase tracking-wider">Failure Events</span>
          <button onClick={addFailureEvent} className="flex items-center gap-1 font-mono text-[9px] text-cyan uppercase tracking-wider hover:text-white">
            <Plus size={11} /> Add Event
          </button>
        </div>
        {(inputs.failure_events ?? []).length === 0 ? (
          <p className="text-[10px] font-mono text-white/30">No failure events — station operates nominally.</p>
        ) : (
          <div className="space-y-2">
            {(inputs.failure_events ?? []).map((ev, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="number" min={0} max={horizonDays} className={`${inputClass} w-16`} value={ev.day}
                  onChange={(e) => updateFailureEvent(i, { day: Number(e.target.value) })} />
                <select className={inputClass} value={ev.type} onChange={(e) => updateFailureEvent(i, { type: e.target.value as FailureEvent['type'] })}>
                  {FAILURE_EVENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                {ev.type === 'storm_onset' && (
                  <input type="number" min={1} placeholder="Duration (d)" className={`${inputClass} w-24`} value={ev.duration_days ?? ''}
                    onChange={(e) => updateFailureEvent(i, { duration_days: Number(e.target.value) })} />
                )}
                <button onClick={() => removeFailureEvent(i)} className="text-white/30 hover:text-crimson shrink-0"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── NL scenario builder (chat) ─────────────────────────────────────────────
//
// Keyword/regex-based, not an LLM call — see nlScenarioParser.ts's header
// comment for why. Each turn parses the prompt, mirrors the result into the
// manual builder above (so it's visible/editable, not a black box), and
// runs it through the same executeRun() the manual "Run Scenario" button
// uses.

interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
}

const EXAMPLE_PROMPTS = [
  "What if the resupply ship can't arrive and a generator also fails?",
  'Run a medical evacuation scenario with 22 people on station',
  'Extended storm, severity 5, over a 120-day horizon',
]

function NLScenarioChat({ onBuild }: { onBuild: (parsed: ReturnType<typeof parsePromptToScenario>) => Promise<ScenarioResult | null> }) {
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns])

  const send = async (prompt: string) => {
    const trimmed = prompt.trim()
    if (!trimmed || busy) return
    setInput('')
    setTurns((prev) => [...prev, { role: 'user', text: trimmed }])
    setBusy(true)
    try {
      const parsed = parsePromptToScenario(trimmed)
      const result = await onBuild(parsed)
      const lines = [...parsed.summary]
      if (result) {
        lines.push(`Ran it: ${result.survivability_verdict} · fuel ${result.fuel_endurance_days}d · food ${result.food_endurance_days}d`)
      } else {
        lines.push("Built it in the form above, but the run itself failed — check the error below and try Run Scenario manually.")
      }
      setTurns((prev) => [...prev, { role: 'assistant', text: lines.map((l) => `• ${l}`).join('\n') }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-brand-surface border border-brand-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-brand-border" style={{ background: 'linear-gradient(90deg, #1868A00c, transparent)' }}>
        <MessageCircle size={13} className="text-cyan" />
        <span className="font-mono text-[10px] text-white/60 uppercase tracking-widest">Describe a scenario</span>
        <span className="font-mono text-[9px] text-white/30 ml-auto">keyword-based, not an LLM</span>
      </div>

      {turns.length === 0 ? (
        <div className="p-4 space-y-2">
          <p className="text-xs font-sans text-white/40">Try one of these, or describe your own what-if in plain language:</p>
          <div className="flex flex-col gap-1.5">
            {EXAMPLE_PROMPTS.map((p) => (
              <button key={p} onClick={() => send(p)} className="text-left text-[11px] font-sans text-white/60 bg-brand-bg border border-brand-border rounded p-2 hover:border-cyan/40 hover:text-white transition-colors">
                {p}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div ref={scrollRef} className="max-h-64 overflow-y-auto p-4 space-y-3">
          {turns.map((t, i) => (
            <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-lg px-3 py-2 text-[11px] font-sans leading-relaxed whitespace-pre-wrap ${
                t.role === 'user' ? 'bg-cyan/15 text-white border border-cyan/20' : 'bg-brand-bg text-white/80 border border-brand-border'
              }`}>
                {t.role === 'assistant' && <Sparkles size={10} className="inline mr-1 text-cyan/70 -mt-0.5" />}
                {t.text}
              </div>
            </div>
          ))}
          {busy && <div className="font-mono text-[10px] text-white/30">Building &amp; running…</div>}
        </div>
      )}

      <div className="flex items-center gap-2 p-3 border-t border-brand-border">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(input) }}
          placeholder="e.g. what if the generator fails during a storm..."
          className={`${inputClass} flex-1`}
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || busy}
          className="shrink-0 w-8 h-8 rounded flex items-center justify-center bg-cyan text-brand-bg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-cyan/80 transition-colors"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SimulationPage() {
  const station = useStationStore((s) => s.station)
  const [presets, setPresets] = useState<ScenarioPreset[]>([])
  const [mode, setMode] = useState<'preset' | 'custom'>('preset')
  const [selectedPreset, setSelectedPreset] = useState<string>('')
  const [customInputs, setCustomInputs] = useState<ScenarioInputs>({ headcount: 25, generator_availability_pct: 100, weather_severity: 1, failure_events: [] })
  const [horizonDays, setHorizonDays] = useState(90)
  const [scenarioName, setScenarioName] = useState('')
  const [running, setRunning] = useState(false)
  const [past, setPast] = useState<ScenarioResult[]>([])
  const [latest, setLatest] = useState<ScenarioResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set())
  const [compareResults, setCompareResults] = useState<ScenarioResult[] | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [presetList, pastList] = await Promise.allSettled([
        scenarioService.getPresets(),
        scenarioService.list(station),
      ])
      setPresets(presetList.status === 'fulfilled' ? presetList.value : [])
      const runs = pastList.status === 'fulfilled' ? pastList.value : []
      setPast(runs)
      if (!latest && runs.length > 0) setLatest(runs[0])
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station])

  useEffect(() => { load() }, [load])

  const selectedPresetMeta = useMemo(() => presets.find((p) => p.id === selectedPreset), [presets, selectedPreset])

  // Shared by the manual "Run Scenario" button and the NL chat builder below
  // — both resolve a concrete {name, preset, horizonDays, inputs} and hand
  // it here, rather than the NL path setting state and hoping a stale
  // closure reads it correctly on the next render.
  const executeRun = useCallback(async (params: { name: string; preset: string | null; horizonDays: number; inputs?: ScenarioInputs }) => {
    setRunning(true)
    setError(null)
    try {
      const result = await scenarioService.run({
        station_id: station,
        name: params.name,
        preset: params.preset,
        horizon_days: params.horizonDays,
        inputs: params.inputs,
      })
      setPast((prev) => [result, ...prev])
      setLatest(result)
      return result
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scenario run failed')
      return null
    } finally {
      setRunning(false)
    }
  }, [station])

  const runScenario = () => {
    if (mode === 'preset' && !selectedPreset) return
    return executeRun({
      name: scenarioName || (mode === 'preset' ? selectedPresetMeta?.label ?? 'Scenario' : 'Custom Scenario'),
      preset: mode === 'preset' ? selectedPreset : null,
      horizonDays,
      inputs: mode === 'custom' ? customInputs : undefined,
    })
  }

  // Called by NLScenarioChat once it's parsed a prompt — mirrors the parsed
  // scenario into the manual builder's own state too (so "what did it just
  // build" is visible/editable there, not just a black box), then runs it.
  const runFromPrompt = useCallback(async (parsed: ReturnType<typeof parsePromptToScenario>) => {
    setMode(parsed.mode)
    if (parsed.mode === 'preset' && parsed.preset) setSelectedPreset(parsed.preset)
    setCustomInputs((prev) => ({ ...prev, ...parsed.inputs }))
    setHorizonDays(parsed.horizonDays)
    setScenarioName(parsed.name)
    return executeRun({ name: parsed.name, preset: parsed.preset, horizonDays: parsed.horizonDays, inputs: parsed.inputs })
  }, [executeRun])

  const toggleCompare = (id: string) => {
    setCompareIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const runCompare = async () => {
    if (compareIds.size < 2) return
    try {
      const results = await scenarioService.compare([...compareIds])
      setCompareResults(results)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Compare failed')
    }
  }

  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-y-auto bg-brand-bg p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="font-mono text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
            <Zap size={16} className="text-cyan" />
            What-If Scenarios — {station.toUpperCase()}
          </h1>
          <p className="text-white/40 text-xs mt-1 font-sans">
            Model station survivability under resupply failure, generator loss, medical evacuation, and more. Never writes live state — results are always projections.
          </p>
        </div>

        {loading && <div className="flex justify-center py-16"><InlineLoader text="Loading scenarios…" /></div>}

        {!loading && (
          <>
            <NLScenarioChat onBuild={runFromPrompt} />

            <div className="bg-brand-surface border border-brand-border rounded p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 bg-brand-bg border border-brand-border rounded p-0.5">
                  <button onClick={() => setMode('preset')} className={`px-3 py-1 rounded text-[10px] font-mono uppercase tracking-wider transition-colors ${mode === 'preset' ? 'bg-cyan/15 text-cyan' : 'text-white/40 hover:text-white'}`}>Preset</button>
                  <button onClick={() => setMode('custom')} className={`px-3 py-1 rounded text-[10px] font-mono uppercase tracking-wider transition-colors ${mode === 'custom' ? 'bg-cyan/15 text-cyan' : 'text-white/40 hover:text-white'}`}>Custom Builder</button>
                </div>
                <input
                  type="text"
                  placeholder="Scenario name (optional)"
                  className={`${inputClass} w-56`}
                  value={scenarioName}
                  onChange={(e) => setScenarioName(e.target.value)}
                />
              </div>

              {mode === 'preset' ? (
                presets.length === 0 ? (
                  <EmptyState message="No presets available" hint="Backend may be unreachable" />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {presets.map((p) => (
                      <label key={p.id} className={`flex items-start gap-2 p-3 rounded border cursor-pointer transition-colors ${selectedPreset === p.id ? 'border-cyan/50 bg-cyan/5' : 'border-brand-border hover:border-white/20'}`}>
                        <input type="radio" name="preset" checked={selectedPreset === p.id} onChange={() => setSelectedPreset(p.id)} className="mt-1 accent-cyan" />
                        <div>
                          <p className="text-xs font-sans font-medium text-white">{p.label}</p>
                          <p className="text-[10px] font-sans text-white/40 mt-0.5">{p.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                )
              ) : (
                <CustomBuilder inputs={customInputs} onChange={setCustomInputs} horizonDays={horizonDays} onHorizonDays={setHorizonDays} />
              )}

              <Button variant="primary" size="sm" icon={<Play size={13} />} loading={running} disabled={mode === 'preset' && !selectedPreset} onClick={runScenario}>
                Run Scenario
              </Button>
              {error && <p className="text-xs font-mono text-crimson mt-2">{error}</p>}
            </div>

            {latest && (
              <div>
                <p className="font-mono text-xs text-white/50 uppercase tracking-widest mb-3">Latest Result</p>
                <ScenarioDetailPanel result={latest} />
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="font-mono text-xs text-white/50 uppercase tracking-widest">Past Runs</p>
                {compareIds.size >= 2 && (
                  <Button variant="secondary" size="sm" icon={<GitCompare size={13} />} onClick={runCompare}>
                    Compare ({compareIds.size})
                  </Button>
                )}
              </div>
              {past.length === 0 ? (
                <EmptyState message="No scenarios run yet" />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {past.map((r) => (
                    <ResultCard key={r.id} result={r} selected={compareIds.has(r.id)} onToggleCompare={() => toggleCompare(r.id)} onSelect={() => setLatest(r)} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {compareResults && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setCompareResults(null)}>
          <div className="w-full max-w-4xl bg-brand-surface border border-brand-border rounded shadow-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-brand-border sticky top-0 bg-brand-surface">
              <h2 className="font-mono text-sm font-semibold text-white uppercase tracking-wider">Scenario Comparison</h2>
              <button onClick={() => setCompareResults(null)} className="text-white/40 hover:text-white"><X size={16} /></button>
            </div>
            <div className="p-4 overflow-x-auto">
              <table className="w-full text-xs min-w-[700px]">
                <thead>
                  <tr className="text-left text-white/40 font-mono uppercase text-[10px]">
                    <th className="py-2 pr-4">Scenario</th>
                    <th className="py-2 pr-4">Verdict</th>
                    <th className="py-2 pr-4 text-right">Fuel (d)</th>
                    <th className="py-2 pr-4 text-right">Food (d)</th>
                    <th className="py-2 pr-4 text-right">First Failure</th>
                    <th className="py-2 pr-4 text-right">Fuel Cost (₹L)</th>
                    <th className="py-2 pr-4 text-right">Logistics (₹L)</th>
                    <th className="py-2 pr-4 text-right">Total (₹L)</th>
                    <th className="py-2 text-right">Carbon (t)</th>
                  </tr>
                </thead>
                <tbody>
                  {compareResults.map((r) => (
                    <tr key={r.id} className="border-t border-brand-border">
                      <td className="py-2 pr-4 text-white/80">{r.name}</td>
                      <td className="py-2 pr-4"><Badge variant={verdictVariant(r.survivability_verdict)} size="sm">{r.survivability_verdict}</Badge></td>
                      <td className="py-2 pr-4 text-right font-mono text-white/70">{r.fuel_endurance_days ?? '—'}</td>
                      <td className="py-2 pr-4 text-right font-mono text-white/70">{r.food_endurance_days ?? '—'}</td>
                      <td className="py-2 pr-4 text-right font-mono text-white/50">{r.first_failure_at_day ?? '—'}</td>
                      <td className="py-2 pr-4 text-right font-mono text-white/70">{r.outputs ? (r.outputs.cost_inr.fuel / 100000).toFixed(1) : '—'}</td>
                      <td className="py-2 pr-4 text-right font-mono text-white/70">{r.outputs ? (r.outputs.cost_inr.logistics / 100000).toFixed(1) : '—'}</td>
                      <td className="py-2 pr-4 text-right font-mono text-white">{r.cost_inr != null ? (r.cost_inr / 100000).toFixed(1) : '—'}</td>
                      <td className="py-2 text-right font-mono text-white/70">{r.carbon_kg_co2e != null ? (r.carbon_kg_co2e / 1000).toFixed(1) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
