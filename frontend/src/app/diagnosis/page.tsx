'use client'

// Guided diagnosis — pick an asset or category, tick what's been observed, get
// ranked probable causes with a check sequence, then (optionally) ask the AI
// analyst for a second opinion. Also ships a fault playbook and recent history
// so the page is useful before anything is entered.
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpen, Check, ChevronDown, ClipboardList, History, ListChecks, Loader2, Sparkles, Stethoscope, Wrench,
} from 'lucide-react'
import { Panel, PageHead, Pill, Meter, type Tone } from '@/components/ui/kit'
import { nodeHealthService } from '@/services/nodeHealth.service'
import { useStationStore } from '@/store/useStationStore'
import { STATION_LABELS } from '@/lib/constants'
import type { NodeHealth } from '@/types/nodes'
import {
  CATEGORY_LABEL, KNOWLEDGE, PLAYBOOK, RECENT_DIAGNOSES, diagnoseLocal,
  type DiagCategory, type PlaybookCase, type RankedCause, type Severity,
} from '@/lib/diagnosis/knowledge'

interface AiAnalysis {
  summary: string
  rootCause: string
  immediateActions: string[]
  riskIfIgnored: string
  provider: string
  configured?: boolean
  degraded?: boolean
}

const CATEGORIES = Object.keys(KNOWLEDGE) as DiagCategory[]
const SEV_TONE: Record<Severity, Tone> = { critical: 'crit', high: 'warn', medium: 'primary', low: 'mute' }
const OUTCOME_TONE = { resolved: 'ok', monitoring: 'warn', escalated: 'crit' } as const
const selectCls =
  'w-full rounded-lg border border-brand-border bg-brand-surface px-3 py-2.5 text-[14px] text-white focus:outline-none focus:border-cyan focus:ring-2 focus:ring-cyan/20'

function barTone(pct: number): Tone {
  return pct >= 40 ? 'crit' : pct >= 25 ? 'warn' : 'primary'
}

export default function DiagnosisPage() {
  const station = useStationStore((s) => s.station)
  const [assets, setAssets] = useState<NodeHealth[]>([])
  const [assetId, setAssetId] = useState('')
  const [category, setCategory] = useState<DiagCategory | ''>('')
  const [evidence, setEvidence] = useState<Set<string>>(new Set())
  const [causes, setCauses] = useState<RankedCause[] | null>(null)
  const [openCause, setOpenCause] = useState<number | null>(0)
  const [ai, setAi] = useState<AiAnalysis | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [pbFilter, setPbFilter] = useState<DiagCategory | 'all'>('all')
  const resultsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    nodeHealthService
      .getNodes({})
      .then((nodes) => setAssets(nodes.filter((n) => !n.stationId || n.stationId === station)))
      .catch(() => setAssets([]))
  }, [station])

  const selectedAsset = assets.find((a) => a.id === assetId)
  const assetCategory = selectedAsset && selectedAsset.type in KNOWLEDGE ? (selectedAsset.type as DiagCategory) : undefined
  const effectiveCategory = assetCategory ?? (category || undefined)
  const profile = effectiveCategory ? KNOWLEDGE[effectiveCategory] : undefined

  const reset = () => {
    setCauses(null)
    setAi(null)
    setAiError(null)
  }

  const toggle = (k: string) => {
    setEvidence((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
    reset()
  }

  const run = (cat = effectiveCategory, ev = evidence) => {
    if (!cat) return
    setCauses(diagnoseLocal(cat, [...ev]))
    setOpenCause(0)
    setAi(null)
    setAiError(null)
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }

  const loadPlaybook = (c: PlaybookCase) => {
    setAssetId('')
    setCategory(c.category)
    const ev = new Set(c.evidence)
    setEvidence(ev)
    run(c.category, ev)
  }

  const evidenceLabels = useMemo(
    () => (profile ? profile.evidence.filter((e) => evidence.has(e.key)).map((e) => e.label) : []),
    [profile, evidence],
  )

  const analyse = async () => {
    if (!effectiveCategory || !causes) return
    setAiLoading(true)
    setAiError(null)
    try {
      const res = await fetch('/api/diagnosis/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: effectiveCategory,
          assetName: selectedAsset?.name ?? null,
          station,
          evidence: evidenceLabels,
          causes,
        }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Analysis failed (${res.status})`)
      setAi((await res.json()) as AiAnalysis)
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Analysis failed')
    } finally {
      setAiLoading(false)
    }
  }

  const playbook = PLAYBOOK.filter((p) => pbFilter === 'all' || p.category === pbFilter)

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1200px] mx-auto px-6 py-7 space-y-6">
        <PageHead
          eyebrow={`Predictive & Risk · ${STATION_LABELS[station]}`}
          title="Guided fault diagnosis."
          sub="Tell the system what you're seeing. It ranks the probable causes, gives you the check sequence in order, and an AI analyst can sanity-check the result."
          right={<Pill tone="primary"><Stethoscope size={11} /> {PLAYBOOK.length} playbook cases · {CATEGORIES.length} categories</Pill>}
        />

        <div className="grid xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-6 items-start">
          {/* ── Input ───────────────────────────────────────────── */}
          <Panel eyebrow="Step 1" title="What are you seeing?">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="eyebrow block mb-1.5">Asset (optional)</label>
                <select
                  value={assetId}
                  onChange={(e) => { setAssetId(e.target.value); setEvidence(new Set()); reset() }}
                  className={selectCls}
                >
                  <option value="">— Choose an asset —</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="eyebrow block mb-1.5">
                  Category {assetId && <span className="normal-case tracking-normal font-normal">(from asset)</span>}
                </label>
                <select
                  value={effectiveCategory ?? ''}
                  onChange={(e) => { setCategory(e.target.value as DiagCategory); setEvidence(new Set()); reset() }}
                  disabled={!!assetId}
                  className={`${selectCls} disabled:opacity-60`}
                >
                  <option value="">— Choose a category —</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between mb-2">
                <p className="eyebrow">Observed evidence</p>
                {evidence.size > 0 && <span className="text-[12px] text-white/70">{evidence.size} selected</span>}
              </div>
              {profile ? (
                <div className="flex flex-wrap gap-2">
                  {profile.evidence.map((e) => {
                    const on = evidence.has(e.key)
                    return (
                      <button
                        key={e.key}
                        type="button"
                        onClick={() => toggle(e.key)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] transition ${
                          on ? 'bg-cyan text-brand-surface border-cyan shadow-cyan-glow' : 'bg-brand-surface border-brand-border text-white hover:border-cyan'
                        }`}
                      >
                        {on && <Check size={13} />}
                        {e.label}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-brand-border bg-brand-surface-2/60 px-4 py-6 text-center text-[13.5px] text-white/75">
                  Pick an asset or a category and the symptoms for that system appear here.
                  <br />
                  Or start from a case in the playbook →
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={!effectiveCategory}
                onClick={() => run()}
                className="inline-flex items-center gap-2 rounded-lg bg-cyan px-5 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-brand-surface shadow-cyan-glow transition hover:bg-cyan/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ListChecks size={15} /> Run diagnosis
              </button>
              {profile && <span className="text-[13px] text-white/70">{profile.fault}</span>}
            </div>
          </Panel>

          {/* ── Playbook ─────────────────────────────────────────── */}
          <Panel
            eyebrow="Fault playbook"
            title="Common cases"
            right={
              <select
                value={pbFilter}
                onChange={(e) => setPbFilter(e.target.value as DiagCategory | 'all')}
                className="rounded-full border border-brand-border bg-brand-surface px-3 py-1.5 text-[12px] font-medium text-white"
              >
                <option value="all">All categories</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
              </select>
            }
            pad={false}
          >
            <ul className="max-h-[430px] overflow-y-auto divide-y divide-brand-border/70">
              {playbook.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => loadPlaybook(p)} className="w-full text-left px-5 py-3.5 hover:bg-brand-surface-2 transition">
                    <div className="flex items-center gap-2 mb-1">
                      <Pill tone={SEV_TONE[p.severity]}>{p.severity}</Pill>
                      <span className="eyebrow">{CATEGORY_LABEL[p.category]}</span>
                      <span className="ml-auto text-[12px] text-white/70">~{p.eta}</span>
                    </div>
                    <p className="text-[14.5px] font-semibold text-white leading-snug">{p.title}</p>
                    <p className="text-[13px] text-white/75 mt-0.5 leading-snug">{p.symptoms}</p>
                    <p className="text-[12.5px] text-cyan mt-1.5 font-medium">Likely: {p.likely} · Load & diagnose →</p>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        {/* ── Results ──────────────────────────────────────────── */}
        <div ref={resultsRef} className="scroll-mt-4">
          {causes && effectiveCategory && (
            <div className="grid xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6 items-start">
              <Panel
                eyebrow="Step 2"
                title="Ranked probable causes"
                right={<Pill tone="primary">{CATEGORY_LABEL[effectiveCategory]}{selectedAsset ? ` · ${selectedAsset.name}` : ''}</Pill>}
              >
                <ul className="space-y-3">
                  {causes.map((c, i) => {
                    const open = openCause === i
                    return (
                      <li key={c.cause} className={`rounded-xl border bg-brand-surface ${i === 0 ? 'border-cyan shadow-cyan-glow' : 'border-brand-border'}`}>
                        <button type="button" onClick={() => setOpenCause(open ? null : i)} className="w-full text-left p-4">
                          <div className="flex items-start gap-3">
                            <span className="font-display text-[26px] leading-none text-white/60 w-7 shrink-0">{i + 1}</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[15px] font-semibold text-white leading-snug">{c.cause}</p>
                              {c.matched_evidence.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                  {c.matched_evidence.map((ev) => (
                                    <span key={ev} className="rounded-full border border-emerald/30 bg-emerald/10 px-2.5 py-0.5 text-[12px] text-emerald">{ev}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <span className="font-display text-[30px] leading-none text-cyan shrink-0">{c.score_pct.toFixed(0)}%</span>
                            <ChevronDown size={16} className={`mt-1 text-white/60 transition ${open ? 'rotate-180' : ''}`} />
                          </div>
                          <div className="mt-3 pl-10"><Meter value={c.score_pct} max={60} tone={barTone(c.score_pct)} height={6} /></div>
                        </button>
                        {open && (
                          <div className="border-t border-brand-border/70 bg-brand-surface-2/60 px-5 py-4 pl-[3.75rem] animate-fade-in">
                            <p className="eyebrow mb-2 flex items-center gap-1.5"><ClipboardList size={12} /> Check sequence</p>
                            <ol className="list-decimal list-outside ml-4 space-y-1.5 text-[14px] text-white leading-snug">
                              {c.check_sequence.map((s, j) => <li key={j}>{s}</li>)}
                            </ol>
                            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-white/80">
                              <span><b className="text-white">Typical fix:</b> {c.eta}</span>
                              {c.spares.length > 0 && (
                                <span className="inline-flex items-center gap-1.5"><Wrench size={12} /> <b className="text-white">Spares:</b> {c.spares.join(', ')}</span>
                              )}
                            </div>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </Panel>

              {/* AI analyst */}
              <Panel eyebrow="Step 3" title="AI analyst" right={<Pill tone="primary"><Sparkles size={11} /> second opinion</Pill>}>
                {!ai && !aiLoading && (
                  <div className="text-[14px] text-white/80 leading-relaxed">
                    <p>Ask the analyst to read the ranking and your observations and explain it in plain language, with the first steps to take.</p>
                    {aiError && <p className="mt-3 text-[13px] text-crimson">{aiError}</p>}
                    <button
                      type="button"
                      onClick={analyse}
                      className="mt-4 inline-flex items-center gap-2 rounded-lg border border-cyan bg-brand-surface px-4 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-cyan transition hover:bg-cyan hover:text-brand-surface"
                    >
                      <Sparkles size={14} /> Analyse with AI
                    </button>
                  </div>
                )}
                {aiLoading && (
                  <p className="inline-flex items-center gap-2 text-[14px] text-white/80"><Loader2 size={15} className="animate-spin text-cyan" /> Analysing the evidence…</p>
                )}
                {ai && (
                  <div className="space-y-4 animate-fade-in">
                    <p className="text-[14.5px] text-white leading-relaxed">{ai.summary}</p>
                    <div>
                      <p className="eyebrow mb-1">Most probable root cause</p>
                      <p className="text-[14.5px] font-semibold text-white">{ai.rootCause}</p>
                    </div>
                    <div>
                      <p className="eyebrow mb-1.5">Do this first</p>
                      <ol className="list-decimal ml-4 space-y-1 text-[14px] text-white leading-snug">
                        {ai.immediateActions.map((a, i) => <li key={i}>{a}</li>)}
                      </ol>
                    </div>
                    <div className="rounded-lg border border-amber/40 bg-amber/10 px-3.5 py-2.5 text-[13.5px] text-white leading-snug">
                      <b>If ignored:</b> {ai.riskIfIgnored}
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[12px] text-white/65">
                        Analysis by {ai.provider}{ai.configured === false ? ' — add GEMINI_API_KEY or OPENAI_API_KEY for the AI analyst' : ai.degraded ? ' — AI provider unavailable, showing rule-based write-up' : ''}
                      </span>
                      <button type="button" onClick={analyse} className="text-[12px] font-semibold uppercase tracking-wider text-cyan hover:underline">Re-run</button>
                    </div>
                  </div>
                )}
              </Panel>
            </div>
          )}
        </div>

        {/* ── History ──────────────────────────────────────────── */}
        <Panel eyebrow="Audit trail" title="Recent diagnoses" right={<History size={16} className="text-white/60" />} pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13.5px]">
              <thead>
                <tr className="eyebrow border-b border-brand-border/70">
                  <th className="px-5 py-3 font-semibold">When</th>
                  <th className="px-3 py-3 font-semibold">Asset</th>
                  <th className="px-3 py-3 font-semibold">Top cause</th>
                  <th className="px-3 py-3 font-semibold text-right">Confidence</th>
                  <th className="px-3 py-3 font-semibold">Outcome</th>
                  <th className="px-5 py-3 font-semibold">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/60">
                {RECENT_DIAGNOSES.map((d) => (
                  <tr key={d.id} className="hover:bg-brand-surface-2/60">
                    <td className="px-5 py-3 text-white/80 whitespace-nowrap">{d.when}</td>
                    <td className="px-3 py-3 font-semibold text-white whitespace-nowrap">{d.asset}</td>
                    <td className="px-3 py-3 text-white">{d.topCause}</td>
                    <td className="px-3 py-3 text-right font-semibold text-white tabular-nums">{d.confidence}%</td>
                    <td className="px-3 py-3"><Pill tone={OUTCOME_TONE[d.outcome]}>{d.outcome}</Pill></td>
                    <td className="px-5 py-3 text-white/80 whitespace-nowrap">{d.by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <p className="flex items-center gap-2 text-[12.5px] text-white/65">
          <BookOpen size={13} /> Rankings come from a curated rule base (prior + evidence), not a learned model, so every number is explainable.
        </p>
      </div>
    </div>
  )
}
