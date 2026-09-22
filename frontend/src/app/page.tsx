// src/app/page.tsx
import Link from 'next/link'
import { UserButton } from '@clerk/nextjs'
import {
  Activity,
  Radar,
  FlaskConical,
  ShieldCheck,
  Network,
  GitBranch,
  Sparkles,
  ArrowRight,
  Clock,
} from 'lucide-react'
import { ROUTES, LIVE_ASSET_COUNT } from '@/lib/constants'
import { getCurrentMembership } from '@/lib/auth/rbac'
import { DEV_BYPASS_AUTH } from '@/lib/auth/devBypass'
import { StationEntryButtons } from '@/components/landing/StationEntryButtons'
import { HimadriMark } from '@/components/ui/HimadriMark'

const STATS = [
  { label: 'Assets Monitored', value: String(LIVE_ASSET_COUNT) },
  { label: 'Stations', value: '2' },
  { label: 'Anomaly Detection', value: '<200ms' },
  { label: 'Audit Trail', value: 'Tamper-Evident' },
]

const TWIN_ITEMS = [
  { label: '2D / Floor Plan / 3D Station Twin', href: ROUTES.TWIN },
  { label: 'Asset Health', href: ROUTES.ASSETS },
  { label: 'Predictive Maintenance', href: ROUTES.PREDICTIVE },
]

const OPERATIONS_ITEMS = [
  { label: 'What-If Scenarios', href: ROUTES.SIMULATION },
  { label: 'Risk Heatmap', href: ROUTES.RISK },
  { label: 'Energy & Logistics', href: ROUTES.ENERGY },
]

const PIPELINE = [
  { icon: Radar, label: 'Discover', desc: 'Map every power, water, waste, and science-instrument dependency across Maitri and Bharati.' },
  { icon: Activity, label: 'Monitor', desc: 'Stream live health scores, alerts, and provenance-tagged station facts in real time.' },
  { icon: FlaskConical, label: 'Simulate', desc: 'Run fuel/food endurance and survivability scenarios before an isolation-window crisis hits.' },
  { icon: ShieldCheck, label: 'Respond', desc: 'Guided fault diagnosis, convoy planning, and a tamper-evident audit trail for every command.' },
]

export default async function LandingPage() {
  // Local-dev-only: NEXT_PUBLIC_DEV_BYPASS_AUTH=true skips Clerk's auth()
  // entirely (no keys configured) — getCurrentMembership() already returns
  // the mock membership unconditionally in that mode. See devBypass.ts.
  let userId: string | null = null
  if (!DEV_BYPASS_AUTH) {
    const clerkAuth = await import('@clerk/nextjs/server').then((m) => m.auth())
    userId = clerkAuth.userId
  }
  const membership = DEV_BYPASS_AUTH || userId ? await getCurrentMembership() : null

  const isActive = !!membership
  const isPending = !DEV_BYPASS_AUTH && !!userId && !membership

  return (
    <div className="min-h-screen bg-brand-bg text-white relative overflow-x-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[900px] rounded-full bg-cyan/5 blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      {/* Marketing top bar */}
      <header className="relative z-10 h-16 border-b border-brand-border flex items-center justify-between px-6 md:px-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-cyan/10 border border-cyan/40 flex items-center justify-center shadow-cyan-glow">
            <HimadriMark className="w-5 h-5 text-cyan" />
          </div>
          <div className="flex flex-col">
            <span className="font-mono font-bold text-white text-base tracking-widest leading-none">HIMADRI</span>
            <span className="font-mono text-[9px] text-cyan/70 tracking-widest uppercase mt-1">Smart India Hackathon 2026</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {isActive ? (
            <>
              <Link
                href={ROUTES.TWIN}
                className="font-mono text-xs uppercase tracking-widest text-white/60 hover:text-white transition-colors px-3 py-2"
              >
                Mission Control
              </Link>
              {!DEV_BYPASS_AUTH && <UserButton />}
            </>
          ) : isPending ? (
            <>
              <Link
                href="/waiting-approval"
                className="font-mono text-xs uppercase tracking-widest text-amber/80 hover:text-amber transition-colors px-3 py-2"
              >
                Awaiting Access
              </Link>
              <UserButton />
            </>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="font-mono text-xs uppercase tracking-widest text-white/60 hover:text-white transition-colors px-3 py-2"
              >
                Sign In
              </Link>
              <Link
                href="/sign-up"
                className="font-mono text-xs uppercase tracking-widest bg-cyan text-brand-bg font-semibold rounded px-4 py-2 shadow-cyan-glow hover:bg-cyan/90 active:scale-95 transition-all"
              >
                Get Started
              </Link>
            </>
          )}
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 flex flex-col items-center text-center px-6 pt-24 pb-20">
        <div className="inline-flex items-center gap-2 border border-cyan/30 bg-cyan/10 rounded-full px-4 py-1.5 mb-8">
          <span className="relative flex items-center justify-center">
            <span className="absolute w-2.5 h-2.5 rounded-full bg-cyan animate-ping opacity-75" />
            <span className="relative w-1.5 h-1.5 rounded-full bg-cyan" />
          </span>
          <span className="font-mono text-[10px] text-cyan tracking-widest uppercase">
            Digital Twin &amp; Remote Management · Maitri &amp; Bharati
          </span>
        </div>

        <h1 className="font-mono font-bold text-4xl md:text-6xl tracking-tight max-w-4xl leading-tight">
          Mission control for India&rsquo;s{' '}
          <span className="text-cyan drop-shadow-[0_0_20px_rgba(31, 158, 109,0.4)]">Antarctic stations</span>
        </h1>

        <p className="mt-6 max-w-2xl text-sm md:text-base font-sans text-white/50 leading-relaxed">
          HIMADRI maps every power, water, waste, and science-instrument dependency at Maitri and Bharati, watches
          station health in real time, and rehearses supply-chain and equipment failure before an isolation-window
          crisis forces the question.
        </p>

        <div className="mt-10 flex flex-col items-center gap-5">
          {isActive ? (
            <>
              <Link
                href={ROUTES.TWIN}
                className="inline-flex items-center gap-2 font-mono text-sm uppercase tracking-widest bg-cyan text-brand-bg font-semibold rounded px-6 py-3 shadow-cyan-glow hover:bg-cyan/90 active:scale-95 transition-all"
              >
                Enter Mission Control
                <ArrowRight size={16} />
              </Link>
              <div className="flex flex-col items-center gap-2.5">
                <span className="font-mono text-[10px] text-white/30 uppercase tracking-widest">Or go straight to a station</span>
                <StationEntryButtons />
              </div>
            </>
          ) : isPending ? (
            <>
              <Link
                href="/waiting-approval"
                className="inline-flex items-center gap-2 font-mono text-sm uppercase tracking-widest bg-amber/10 border border-amber/40 text-amber rounded px-6 py-3 hover:bg-amber/20 active:scale-95 transition-all"
              >
                <Clock size={16} />
                Check Access Status
              </Link>
              <p className="font-mono text-xs text-white/30 tracking-wider">
                A Station Leader or HQ Operator will activate your account shortly.
              </p>
            </>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="inline-flex items-center gap-2 font-mono text-sm uppercase tracking-widest bg-cyan text-brand-bg font-semibold rounded px-6 py-3 shadow-cyan-glow hover:bg-cyan/90 active:scale-95 transition-all"
              >
                Enter Mission Control
                <ArrowRight size={16} />
              </Link>
              <Link
                href="/sign-up"
                className="inline-flex items-center gap-2 font-mono text-sm uppercase tracking-widest bg-brand-surface border border-brand-border text-white/80 rounded px-6 py-3 hover:border-white/30 hover:text-white hover:bg-brand-surface-2 active:scale-95 transition-all"
              >
                Request Access
              </Link>
            </>
          )}
        </div>

        {/* Stat strip */}
        <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-px bg-brand-border border border-brand-border rounded max-w-3xl w-full overflow-hidden">
          {STATS.map((s) => (
            <div key={s.label} className="bg-brand-bg px-6 py-5 flex flex-col items-center">
              <span className="font-mono text-2xl font-bold text-cyan">{s.value}</span>
              <span className="font-mono text-[9px] text-white/40 uppercase tracking-widest mt-1 text-center">
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Two environments */}
      <section className="relative z-10 px-6 md:px-10 pb-20">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-6">
          <div className="bg-brand-surface border border-brand-border rounded p-6 hover:border-emerald/40 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-emerald/10 border border-emerald/40 flex items-center justify-center shadow-emerald-glow mb-4">
              <Network size={18} className="text-emerald" />
            </div>
            <h3 className="font-mono text-sm font-bold uppercase tracking-widest text-white">Station Twin</h3>
            <p className="text-xs font-sans text-white/40 mt-2 mb-5 leading-relaxed">
              The live observation deck. Read-only reality — every asset, every dependency, every provenance-tagged
              fact, watched continuously across both stations.
            </p>
            <ul className="space-y-2">
              {TWIN_ITEMS.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-2 text-xs font-mono text-white/60 hover:text-emerald transition-colors group"
                  >
                    <span className="w-1 h-1 rounded-full bg-emerald/60 group-hover:bg-emerald shrink-0" />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-brand-surface border border-brand-border rounded p-6 hover:border-cyan/40 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-cyan/10 border border-cyan/40 flex items-center justify-center shadow-cyan-glow mb-4">
              <GitBranch size={18} className="text-cyan" />
            </div>
            <h3 className="font-mono text-sm font-bold uppercase tracking-widest text-white">Operations</h3>
            <p className="text-xs font-sans text-white/40 mt-2 mb-5 leading-relaxed">
              The war room. Fuel/food endurance modeling, subsystem risk scoring, and energy &amp; logistics planning
              before you commit a convoy or a generator swap.
            </p>
            <ul className="space-y-2">
              {OPERATIONS_ITEMS.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-2 text-xs font-mono text-white/60 hover:text-cyan transition-colors group"
                  >
                    <span className="w-1 h-1 rounded-full bg-cyan/60 group-hover:bg-cyan shrink-0" />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Pipeline */}
      <section className="relative z-10 px-6 md:px-10 pb-24">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <p className="font-mono text-[10px] text-white/30 uppercase tracking-widest mb-2">How it works</p>
            <h2 className="font-mono text-xl font-bold text-white uppercase tracking-widest">
              Discover → Monitor → Simulate → Respond
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {PIPELINE.map((step, i) => (
              <div key={step.label} className="relative bg-brand-bg border border-brand-border rounded p-5">
                <span className="absolute top-3 right-3 font-mono text-[9px] text-white/20">
                  0{i + 1}
                </span>
                <step.icon size={18} className="text-cyan mb-3" />
                <p className="font-mono text-xs font-bold text-white uppercase tracking-widest">{step.label}</p>
                <p className="text-[11px] font-sans text-white/40 mt-2 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-brand-border px-6 md:px-10 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-white/30">
          <Sparkles size={14} />
          <span className="font-mono text-[10px] uppercase tracking-widest">
            Smart India Hackathon 2026 — PS 26060 · ISRO / NCPOR
          </span>
        </div>
        <span className="font-mono text-[10px] text-white/20 uppercase tracking-widest">
          HIMADRI © 2026 — Digital Twin for Maitri &amp; Bharati Research Stations
        </span>
      </footer>
    </div>
  )
}
