'use client'

// What-If Scenarios — a builder rail on the left (describe it in words, pick a
// preset, or build it by hand) and the verdict + charts on the right. Scenarios
// never write live state; every result is a projection.
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip,
  BarChart, Bar as RBar, Cell, Legend,
} from 'recharts'
import {
  Zap, Play, GitCompare, X, Plus, Trash2, Fuel, Wheat, IndianRupee, Cloud, MessageCircle, Send, Sparkles, Clock, ShieldCheck, ShieldAlert,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { InlineLoader, EmptyState } from '@/components/ui/Loader'
import { PageShell, PageHeader, Panel, MetricTile, SegTabs, ChartTooltip, LegendDot, Bar, inputClass, labelClass } from '@/components/ui/Panel'
import {
  scenarioService,
  type ScenarioPreset, type ScenarioResult, type ScenarioInputs, type FailureEvent,
} from '@/services/scenario.service'
import { parsePromptToScenario } from '@/lib/nlScenarioParser'
import { useStationStore } from '@/store/useStationStore'
import { STATION_LABELS } from '@/lib/constants'
import { CHART, axisTick, gridProps, fmtNum } from '@/lib/chartTheme'
import type { BadgeVariant } from '@/types/common'

const FAILURE_EVENT_TYPES: Array<{ value: FailureEvent['type']; label: string }> = [
  { value: 'generator_failure', label: 'Generator failure' },
  { value: 'convoy_stranded', label: 'Convoy stranded' },
  { value: 'medevac_convoy', label: 'Medevac convoy' },
  { value: 'storm_onset', label: 'Storm onset' },
]

const COMPARE_COLORS = [CHART.blue, CHART.amber, CHART.green, CHART.violet, CHART.red]

function verdictVariant(verdict: string | null): BadgeVariant {
  return (verdict ?? '').toLowerCase().includes('fail') ? 'critical' : 'healthy'
}
const failed = (r: ScenarioResult) => (r.survivability_verdict ?? '').toLowerCase().includes('fail')
const lakh = (v: number) => `₹${(v / 100000).toFixed(1)}L`

// ─── Result detail ──────────────────────────────────────────────────────────

function ResultView({ result }: { result: ScenarioResult }) {
  const o = result.outputs
  const cost = o?.cost_inr
  const bad = failed(result)
  const costRows = cost ? [
    { name: 'Fuel', value: cost.fuel, color: CHART.blue },
    { name: 'Logistics', value: cost.logistics, color: CHART.violet },
    { name: 'Spares', value: cost.spares, color: CHART.amber },
    { name: 'Avoided failure', value: cost.avoided_failure, color: CHART.red },
  ] : []

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-brand-surface p-4 shadow-[0_1px_2px_rgba(22,40,58,0.06)]" style={{ borderColor: bad ? `${CHART.red}66` : `${CHART.green}66`, borderLeft: `5px solid ${bad ? CHART.red : CHART.green}` }}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="font-sans text-lg font-semibold text-white flex items-center gap-2">
              {bad ? <ShieldAlert size={20} className="text-crimson" /> : <ShieldCheck size={20} className="text-emerald" />}
              {result.name}
            </p>
            <p className="font-mono text-xs text-white/70 mt-1">
              {result.station_id.toUpperCase()} · {result.horizon_days}-day horizon · {new Date(result.created_at).toLocaleString('en-GB')}
            </p>
          </div>
          <Badge variant={verdictVariant(result.survivability_verdict)} size="md">{result.survivability_verdict ?? 'unknown'}</Badge>
        </div>
        {result.first_failure_at_day !== null && (
          <p className="mt-3 font-sans text-sm text-crimson font-medium">First failure on day {result.first_failure_at_day}: {result.first_failure_cause}</p>
        )}
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <MetricTile label="Fuel endurance" value={result.fuel_endurance_days ?? '—'} unit="days" icon={<Fuel size={15} />} color={(result.fuel_endurance_days ?? 999) < result.horizon_days ? CHART.amber : CHART.green} />
        <MetricTile label="Food endurance" value={result.food_endurance_days ?? '—'} unit="days" icon={<Wheat size={15} />} color={(result.food_endurance_days ?? 999) < result.horizon_days ? CHART.amber : CHART.green} />
        <MetricTile label="Total cost" value={result.cost_inr != null ? (result.cost_inr / 100000).toFixed(1) : '—'} unit="₹ lakh" icon={<IndianRupee size={15} />} />
        <MetricTile label="Carbon" value={result.carbon_kg_co2e != null ? (result.carbon_kg_co2e / 1000).toFixed(1) : '—'} unit="t CO₂e" icon={<Cloud size={15} />} />
      </div>

      {o && o.timeline.length > 0 && (
        <Panel title="Fuel & food projection" subtitle="Fuel on hand (left axis, litres) and days of food remaining (right axis).">
          <div className="flex gap-4 mb-2"><LegendDot color={CHART.blue} label="Fuel (L)" /><LegendDot color={CHART.green} label="Food (days)" />{result.first_failure_at_day !== null && <LegendDot color={CHART.red} label="First failure" dashed />}</div>
          <div className="h-[280px] min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <LineChart data={o.timeline} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="day" tick={axisTick} tickLine={false} axisLine={{ stroke: CHART.grid }} tickFormatter={(d: number) => `D${d}`} minTickGap={30} />
                <YAxis yAxisId="fuel" tick={{ ...axisTick, fill: CHART.blue }} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
                <YAxis yAxisId="food" orientation="right" tick={{ ...axisTick, fill: CHART.green }} tickLine={false} axisLine={false} width={40} />
                <Tooltip content={<ChartTooltip labelFormatter={(l) => `Day ${l}`} format={(v) => fmtNum(v)} />} />
                {result.first_failure_at_day !== null && <ReferenceLine yAxisId="fuel" x={result.first_failure_at_day} stroke={CHART.red} strokeDasharray="4 4" label={{ value: 'FAILURE', fill: CHART.red, fontSize: 11, position: 'insideTopRight' }} />}
                <Line yAxisId="fuel" type="monotone" dataKey="fuel_liters" name="Fuel (L)" stroke={CHART.blue} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                <Line yAxisId="food" type="monotone" dataKey="food_days_left" name="Food (days)" stroke={CHART.green} strokeWidth={2.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      )}

      {cost && (
        <Panel title="Where the money goes" icon={<IndianRupee size={14} />} subtitle={`Total ${lakh(cost.total)}`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div className="h-[170px] min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <BarChart data={costRows} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid {...gridProps} horizontal={false} vertical />
                  <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${(v / 100000).toFixed(0)}L`} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ ...axisTick, fill: '#16283A' }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip format={(v) => lakh(v)} />} cursor={{ fill: '#D9E9F2' }} />
                  <RBar dataKey="value" name="Cost" radius={[0, 4, 4, 0]} barSize={16} isAnimationActive={false}>
                    {costRows.map((r) => <Cell key={r.name} fill={r.color} />)}
                  </RBar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2.5">
              {costRows.map((r) => (
                <div key={r.name}>
                  <div className="flex justify-between font-mono text-xs mb-1"><span className="text-white/80">{r.name}</span><span className="text-white font-bold">{lakh(r.value)}</span></div>
                  <Bar value={r.value} max={cost.total || 1} color={r.color} />
                </div>
              ))}
            </div>
          </div>
        </Panel>
      )}
    </div>
  )
}

// ─── Past-run card ──────────────────────────────────────────────────────────

function RunCard({ result, selected, active, onToggleCompare, onSelect }: { result: ScenarioResult; selected: boolean; active: boolean; onToggleCompare: () => void; onSelect: () => void }) {
  return (
    <div onClick={onSelect} className={`rounded-md border p-3 cursor-pointer transition-colors bg-brand-surface ${active ? 'border-cyan ring-1 ring-cyan/40' : 'border-brand-border hover:border-cyan/50'}`}>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0">
          <p className="font-sans text-sm font-semibold text-white truncate">{result.name}</p>
          <p className="font-mono text-[11px] text-white/62 mt-0.5">{result.station_id.toUpperCase()} · {new Date(result.created_at).toLocaleDateString('en-GB')}</p>
        </div>
        <Badge variant={verdictVariant(result.survivability_verdict)} size="sm">{result.survivability_verdict ?? '—'}</Badge>
      </div>
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs text-white/70">Fuel <span className="text-white font-bold">{result.fuel_endurance_days ?? '—'}d</span> · Food <span className="text-white font-bold">{result.food_endurance_days ?? '—'}d</span></p>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleCompare() }}
          className={`font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded border transition-colors ${selected ? 'border-cyan bg-cyan text-brand-bg font-bold' : 'border-brand-border text-white/75 hover:text-white hover:border-cyan/50'}`}
        >
          {selected ? 'Comparing' : 'Compare'}
        </button>
      </div>
    </div>
  )
}

// ─── Custom builder ─────────────────────────────────────────────────────────

function CustomBuilder({ inputs, onChange, horizonDays, onHorizonDays }: {
  inputs: ScenarioInputs; onChange: (i: ScenarioInputs) => void; horizonDays: number; onHorizonDays: (d: number) => void
}) {
  const [fuelDeliveryEnabled, setFuelDeliveryEnabled] = useState(Boolean(inputs.fuel_delivery))
  const events = inputs.failure_events ?? []
  const upd = (i: number, patch: Partial<FailureEvent>) => { const n = [...events]; n[i] = { ...n[i], ...patch }; onChange({ ...inputs, failure_events: n }) }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div><label className={labelClass}>Headcount</label><input type="number" min={1} max={80} className={inputClass} value={inputs.headcount ?? 25} onChange={(e) => onChange({ ...inputs, headcount: Number(e.target.value) })} /></div>
        <div><label className={labelClass}>Horizon (days)</label><input type="number" min={7} max={365} className={inputClass} value={horizonDays} onChange={(e) => onHorizonDays(Number(e.target.value))} /></div>
        <div><label className={labelClass}>Generator availability %</label><input type="number" min={0} max={100} className={inputClass} value={inputs.generator_availability_pct ?? 100} onChange={(e) => onChange({ ...inputs, generator_availability_pct: Number(e.target.value) })} /></div>
        <div><label className={labelClass}>Weather severity (1–5)</label><input type="number" min={1} max={5} className={inputClass} value={inputs.weather_severity ?? 1} onChange={(e) => onChange({ ...inputs, weather_severity: Math.min(5, Math.max(1, Number(e.target.value))) })} /></div>
      </div>

      <div className="border-t border-brand-border pt-3">
        <label className="flex items-center gap-2 mb-2 cursor-pointer font-sans text-sm text-white">
          <input type="checkbox" className="accent-cyan" checked={fuelDeliveryEnabled} onChange={(e) => {
            setFuelDeliveryEnabled(e.target.checked)
            onChange({ ...inputs, fuel_delivery: e.target.checked ? { day: 30, litres: 20000 } : null })
          }} />
          Scheduled fuel delivery
        </label>
        {fuelDeliveryEnabled && (
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelClass}>Day</label><input type="number" min={0} max={horizonDays} className={inputClass} value={inputs.fuel_delivery?.day ?? 30} onChange={(e) => onChange({ ...inputs, fuel_delivery: { day: Number(e.target.value), litres: inputs.fuel_delivery?.litres ?? 20000 } })} /></div>
            <div><label className={labelClass}>Litres</label><input type="number" min={0} className={inputClass} value={inputs.fuel_delivery?.litres ?? 20000} onChange={(e) => onChange({ ...inputs, fuel_delivery: { day: inputs.fuel_delivery?.day ?? 30, litres: Number(e.target.value) } })} /></div>
          </div>
        )}
      </div>

      <div className="border-t border-brand-border pt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="font-sans text-sm text-white">Failure events</span>
          <button onClick={() => onChange({ ...inputs, failure_events: [...events, { day: 10, type: 'generator_failure' }] })} className="flex items-center gap-1 font-mono text-[11px] text-cyan uppercase tracking-wider font-bold hover:underline"><Plus size={12} /> Add</button>
        </div>
        {events.length === 0 ? <p className="font-sans text-xs text-white/70">None — the station runs nominally.</p> : (
          <div className="space-y-2">
            {events.map((ev, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="number" min={0} max={horizonDays} className={`${inputClass} !w-16 shrink-0`} value={ev.day} onChange={(e) => upd(i, { day: Number(e.target.value) })} aria-label="Day" />
                <select className={inputClass} value={ev.type} onChange={(e) => upd(i, { type: e.target.value as FailureEvent['type'] })}>
                  {FAILURE_EVENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                {ev.type === 'storm_onset' && <input type="number" min={1} placeholder="days" className={`${inputClass} !w-20 shrink-0`} value={ev.duration_days ?? ''} onChange={(e) => upd(i, { duration_days: Number(e.target.value) })} />}
                <button onClick={() => onChange({ ...inputs, failure_events: events.filter((_, k) => k !== i) })} className="text-white/55 hover:text-crimson shrink-0" aria-label="Remove"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Natural-language builder ───────────────────────────────────────────────

interface ChatTurn { role: 'user' | 'assistant'; text: string }
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
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [turns])

  const send = async (prompt: string) => {
    const t = prompt.trim()
    if (!t || busy) return
    setInput('')
    setTurns((p) => [...p, { role: 'user', text: t }])
    setBusy(true)
    try {
      const parsed = parsePromptToScenario(t)
      const result = await onBuild(parsed)
      const lines = [...parsed.summary]
      lines.push(result ? `Ran it: ${result.survivability_verdict} · fuel ${result.fuel_endurance_days}d · food ${result.food_endurance_days}d` : 'Built it below, but the run failed — try Run scenario manually.')
      setTurns((p) => [...p, { role: 'assistant', text: lines.map((l) => `• ${l}`).join('\n') }])
    } finally { setBusy(false) }
  }

  return (
    <div>
      {turns.length === 0 ? (
        <div className="space-y-1.5 mb-3">
          {EXAMPLE_PROMPTS.map((p) => (
            <button key={p} onClick={() => send(p)} className="w-full text-left text-xs font-sans text-white/85 bg-brand-surface-2 border border-brand-border rounded-md p-2.5 hover:border-cyan hover:text-white transition-colors">{p}</button>
          ))}
        </div>
      ) : (
        <div ref={scrollRef} className="max-h-56 overflow-y-auto mb-3 space-y-2">
          {turns.map((t, i) => (
            <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[92%] rounded-lg px-3 py-2 text-xs font-sans leading-relaxed whitespace-pre-wrap ${t.role === 'user' ? 'bg-cyan text-brand-bg' : 'bg-brand-surface-2 text-white border border-brand-border'}`}>
                {t.role === 'assistant' && <Sparkles size={11} className="inline mr-1 text-cyan -mt-0.5" />}{t.text}
              </div>
            </div>
          ))}
          {busy && <p className="font-mono text-[11px] text-white/70">Building &amp; running…</p>}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(input) }} placeholder="e.g. generator fails during a storm…" className={inputClass} />
        <button onClick={() => send(input)} disabled={!input.trim() || busy} aria-label="Send" className="shrink-0 w-10 h-10 rounded-md flex items-center justify-center bg-cyan text-brand-bg disabled:opacity-40 hover:bg-cyan/85 transition-colors"><Send size={15} /></button>
      </div>
      <p className="font-mono text-[10px] text-white/62 mt-1.5">Keyword-based parser, not an LLM.</p>
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function SimulationPage() {
  const station = useStationStore((s) => s.station)
  const [presets, setPresets] = useState<ScenarioPreset[]>([])
  const [mode, setMode] = useState<'preset' | 'custom'>('preset')
  const [selectedPreset, setSelectedPreset] = useState('')
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
      const [presetList, pastList] = await Promise.allSettled([scenarioService.getPresets(), scenarioService.list(station)])
      setPresets(presetList.status === 'fulfilled' ? presetList.value : [])
      const runs = pastList.status === 'fulfilled' ? pastList.value : []
      setPast(runs)
      if (!latest && runs.length > 0) setLatest(runs[0])
    } finally { setLoading(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station])
  useEffect(() => { load() }, [load])

  const selectedPresetMeta = useMemo(() => presets.find((p) => p.id === selectedPreset), [presets, selectedPreset])

  const executeRun = useCallback(async (params: { name: string; preset: string | null; horizonDays: number; inputs?: ScenarioInputs }) => {
    setRunning(true)
    setError(null)
    try {
      const result = await scenarioService.run({ station_id: station, name: params.name, preset: params.preset, horizon_days: params.horizonDays, inputs: params.inputs })
      setPast((prev) => [result, ...prev])
      setLatest(result)
      return result
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scenario run failed')
      return null
    } finally { setRunning(false) }
  }, [station])

  const runScenario = () => {
    if (mode === 'preset' && !selectedPreset) return
    return executeRun({
      name: scenarioName || (mode === 'preset' ? selectedPresetMeta?.label ?? 'Scenario' : 'Custom scenario'),
      preset: mode === 'preset' ? selectedPreset : null, horizonDays, inputs: mode === 'custom' ? customInputs : undefined,
    })
  }

  const runFromPrompt = useCallback(async (parsed: ReturnType<typeof parsePromptToScenario>) => {
    setMode(parsed.mode)
    if (parsed.mode === 'preset' && parsed.preset) setSelectedPreset(parsed.preset)
    setCustomInputs((prev) => ({ ...prev, ...parsed.inputs }))
    setHorizonDays(parsed.horizonDays)
    setScenarioName(parsed.name)
    return executeRun({ name: parsed.name, preset: parsed.preset, horizonDays: parsed.horizonDays, inputs: parsed.inputs })
  }, [executeRun])

  const toggleCompare = (id: string) => setCompareIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const runCompare = async () => {
    if (compareIds.size < 2) return
    try { setCompareResults(await scenarioService.compare([...compareIds])) } catch (err) { setError(err instanceof Error ? err.message : 'Compare failed') }
  }

  // overlay of every compared run's fuel curve, keyed by day
  const overlay = useMemo(() => {
    if (!compareResults) return []
    const days = new Map<number, Record<string, number>>()
    compareResults.forEach((r, idx) => r.outputs?.timeline.forEach((t) => {
      const row = days.get(t.day) ?? { day: t.day }
      row[`r${idx}`] = t.fuel_liters
      days.set(t.day, row)
    }))
    return [...days.values()].sort((a, b) => a.day - b.day)
  }, [compareResults])

  return (
    <PageShell>
      <PageHeader
        icon={<Zap size={20} />} eyebrow="Simulation" title={`What-If Scenarios — ${STATION_LABELS[station]}`}
        subtitle="Model survivability under resupply failure, generator loss, medical evacuation and storms. Scenarios never touch live state — results are projections."
      />

      {loading && <div className="flex justify-center py-16"><InlineLoader text="Loading scenarios…" /></div>}

      {!loading && (
        <div className="grid grid-cols-1 xl:grid-cols-[400px_minmax(0,1fr)] gap-5 items-start">
          {/* builder rail */}
          <div className="space-y-4">
            <Panel title="Describe it" icon={<MessageCircle size={14} />} subtitle="Say what you want to test in plain language.">
              <NLScenarioChat onBuild={runFromPrompt} />
            </Panel>

            <Panel title="Or build it" icon={<Zap size={14} />} accent={CHART.blue}
              actions={<SegTabs size="sm" value={mode} onChange={setMode} options={[{ value: 'preset', label: 'Preset' }, { value: 'custom', label: 'Custom' }]} />}>
              <div className="space-y-4">
                <div><label className={labelClass}>Scenario name</label><input type="text" placeholder="Optional" className={inputClass} value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} /></div>
                {mode === 'preset' ? (
                  presets.length === 0 ? <EmptyState message="No presets available" hint="Backend may be unreachable" /> : (
                    <div className="space-y-2">
                      {presets.map((p) => (
                        <label key={p.id} className={`flex items-start gap-2.5 p-3 rounded-md border cursor-pointer transition-colors ${selectedPreset === p.id ? 'border-cyan bg-cyan/10' : 'border-brand-border bg-brand-surface hover:border-cyan/50'}`}>
                          <input type="radio" name="preset" checked={selectedPreset === p.id} onChange={() => setSelectedPreset(p.id)} className="mt-1 accent-cyan" />
                          <div><p className="text-sm font-sans font-semibold text-white">{p.label}</p><p className="text-xs font-sans text-white/70 mt-0.5 leading-snug">{p.description}</p></div>
                        </label>
                      ))}
                      <div><label className={labelClass}>Horizon (days)</label><input type="number" min={7} max={365} className={inputClass} value={horizonDays} onChange={(e) => setHorizonDays(Number(e.target.value))} /></div>
                    </div>
                  )
                ) : (
                  <CustomBuilder inputs={customInputs} onChange={setCustomInputs} horizonDays={horizonDays} onHorizonDays={setHorizonDays} />
                )}
                <Button variant="primary" size="lg" className="w-full" icon={<Play size={14} />} loading={running} disabled={mode === 'preset' && !selectedPreset} onClick={runScenario}>Run scenario</Button>
                {error && <p className="text-xs font-mono text-crimson">{error}</p>}
              </div>
            </Panel>
          </div>

          {/* results */}
          <div className="space-y-5 min-w-0">
            {latest ? <ResultView result={latest} /> : (
              <Panel><EmptyState message="No scenario run yet" hint="Describe one on the left or pick a preset, then run it." /></Panel>
            )}

            <Panel title="Past runs" icon={<Clock size={14} />} subtitle="Select two or more to compare side by side."
              actions={compareIds.size >= 2 ? <Button variant="primary" size="sm" icon={<GitCompare size={13} />} onClick={runCompare}>Compare ({compareIds.size})</Button> : undefined}>
              {past.length === 0 ? <EmptyState message="No scenarios run yet" /> : (
                <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
                  {past.map((r) => <RunCard key={r.id} result={r} selected={compareIds.has(r.id)} active={latest?.id === r.id} onToggleCompare={() => toggleCompare(r.id)} onSelect={() => setLatest(r)} />)}
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}

      {compareResults && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#16283A]/45 backdrop-blur-sm p-4" onClick={() => setCompareResults(null)}>
          <div className="w-full max-w-5xl bg-brand-surface border border-brand-border rounded-lg shadow-2xl max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-brand-border sticky top-0 bg-brand-surface z-10">
              <h2 className="font-mono text-sm font-bold text-white uppercase tracking-wider">Scenario comparison</h2>
              <button onClick={() => setCompareResults(null)} className="text-white/70 hover:text-white" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-5">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-wider text-white/70 mb-2">Fuel on hand over time</p>
                <div className="h-[260px] min-w-0">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                    <LineChart data={overlay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey="day" tick={axisTick} tickLine={false} axisLine={{ stroke: CHART.grid }} tickFormatter={(d: number) => `D${d}`} minTickGap={30} />
                      <YAxis tick={axisTick} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
                      <Tooltip content={<ChartTooltip labelFormatter={(l) => `Day ${l}`} format={(v) => `${fmtNum(v)} L`} />} />
                      <Legend wrapperStyle={{ fontSize: 12, fontFamily: 'var(--font-mono)' }} />
                      {compareResults.map((r, i) => <Line key={r.id} dataKey={`r${i}`} name={r.name} stroke={COMPARE_COLORS[i % COMPARE_COLORS.length]} strokeWidth={2.5} dot={false} isAnimationActive={false} />)}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[700px]">
                  <thead>
                    <tr className="text-left font-mono uppercase text-[11px] text-white/62">
                      <th className="py-2 pr-4 font-semibold">Scenario</th><th className="py-2 pr-4 font-semibold">Verdict</th>
                      <th className="py-2 pr-4 font-semibold text-right">Fuel (d)</th><th className="py-2 pr-4 font-semibold text-right">Food (d)</th>
                      <th className="py-2 pr-4 font-semibold text-right">First failure</th><th className="py-2 pr-4 font-semibold text-right">Total (₹L)</th><th className="py-2 font-semibold text-right">Carbon (t)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compareResults.map((r, i) => (
                      <tr key={r.id} className="border-t border-brand-border">
                        <td className="py-2.5 pr-4 font-sans text-sm text-white"><span className="inline-block w-2.5 h-2.5 rounded-sm mr-2" style={{ background: COMPARE_COLORS[i % COMPARE_COLORS.length] }} />{r.name}</td>
                        <td className="py-2.5 pr-4"><Badge variant={verdictVariant(r.survivability_verdict)} size="sm">{r.survivability_verdict}</Badge></td>
                        <td className="py-2.5 pr-4 text-right font-mono text-white">{r.fuel_endurance_days ?? '—'}</td>
                        <td className="py-2.5 pr-4 text-right font-mono text-white">{r.food_endurance_days ?? '—'}</td>
                        <td className="py-2.5 pr-4 text-right font-mono text-white/80">{r.first_failure_at_day ?? '—'}</td>
                        <td className="py-2.5 pr-4 text-right font-mono text-white font-bold">{r.cost_inr != null ? (r.cost_inr / 100000).toFixed(1) : '—'}</td>
                        <td className="py-2.5 text-right font-mono text-white/80">{r.carbon_kg_co2e != null ? (r.carbon_kg_co2e / 1000).toFixed(1) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  )
}
