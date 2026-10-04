// src/app/page.tsx
import Link from 'next/link'
import { UserButton } from '@clerk/nextjs'
import { ArrowRight, Fingerprint, LineChart, Radio, ShieldCheck, WifiOff } from 'lucide-react'
import { ROUTES } from '@/lib/constants'
import { getCurrentMembership } from '@/lib/auth/rbac'
import { DEV_BYPASS_AUTH } from '@/lib/auth/devBypass'
import { StationEntryButtons } from '@/components/landing/StationEntryButtons'
import { Constellation } from '@/components/landing/Constellation'
import { LiveStrip } from '@/components/landing/LiveStrip'
import { PolarMap } from '@/components/landing/PolarMap'
import Image from 'next/image'

const PILLARS = [
  {
    icon: WifiOff,
    tag: 'Survive',
    title: 'It never waits for the satellite.',
    body: 'Ingest, alerting, the twin and every approval run on the station node. The uplink is a courier: priority lanes, content-hashed batches, a bytes budget — alerts first, bulk last.',
    href: ROUTES.OVERVIEW,
    cta: 'See station status',
  },
  {
    icon: ShieldCheck,
    tag: 'Trust',
    title: 'Nothing acts without a witness.',
    body: 'Life-safety commands need a second, different person inside 15 minutes. Every event is hash-chained; verification recomputes the whole ledger. Every number carries its provenance.',
    href: ROUTES.REMOTE_CONTROL,
    cta: 'Issue a command',
  },
  {
    icon: LineChart,
    tag: 'Foresee',
    title: 'Predictions that show their working.',
    body: 'Explainable risk scoring, fuel endurance fitted from live tank sensors, forecasts with honest intervals, and a what-if engine that never touches live state.',
    href: ROUTES.PREDICTIVE,
    cta: 'Open predictive modelling',
  },
]

const STEPS = [
  { n: '01', t: 'Sense', d: 'Arduino + Pi hardware, device agents and MQTT feed one ingest function.' },
  { n: '02', t: 'Understand', d: 'Rules, risk and a dependency graph turn readings into consequences.' },
  { n: '03', t: 'Decide', d: 'What-if scenarios and ranked advice, with the evidence attached.' },
  { n: '04', t: 'Act', d: 'Two-person, audited remote actuation back to the device.' },
]

const VS = [
  ['Needs the link to be useful', 'Edge node keeps running; sync is store-and-forward'],
  ['One click flips a generator', 'Life-safety actions need a second authorised user'],
  ['Numbers with no source', 'Provenance badge on every fact: verified · documentary · simulated'],
  ['“AI” that is a black box', 'Risk = weighted factors with the evidence shown'],
  ['Software-only demo', 'A physical twin: real sensors, real commands back to hardware'],
]

export default async function LandingPage() {
  let userId: string | null = null
  if (!DEV_BYPASS_AUTH) {
    const clerkAuth = await import('@clerk/nextjs/server').then((m) => m.auth())
    userId = clerkAuth.userId
  }
  const membership = DEV_BYPASS_AUTH || userId ? await getCurrentMembership() : null
  const isActive = !!membership

  return (
    <div className="min-h-screen bg-brand-bg text-white relative overflow-x-hidden">
      {/* header */}
      <header className="sticky top-0 z-20 backdrop-blur bg-brand-bg/80 border-b border-brand-border/70">
        <div className="max-w-[1240px] mx-auto h-16 px-6 flex items-center justify-between">
          <Link href="/" className="flex items-center" aria-label="HIMADRI home">
            <Image src="/himadri-logo.png" alt="HIMADRI" width={945} height={268} priority className="h-11 w-auto mix-blend-multiply" />
          </Link>
          <nav className="hidden md:flex items-center gap-7 font-mono text-[11px] uppercase tracking-wider text-white/55">
          </nav>
          <div className="flex items-center gap-3">
            {isActive ? (
              <>
                <Link href={ROUTES.OVERVIEW} className="rounded-lg bg-white text-brand-surface px-4 py-2 font-mono text-[11px] uppercase tracking-wider hover:opacity-90">
                  Mission control
                </Link>
                {!DEV_BYPASS_AUTH && <UserButton />}
              </>
            ) : (
              <>
                <Link href="/sign-in" className="font-mono text-[11px] uppercase tracking-wider text-white/75 hover:text-white px-2">Sign in</Link>
                <Link href="/sign-up" className="rounded-lg bg-white text-brand-surface px-4 py-2 font-mono text-[11px] uppercase tracking-wider hover:opacity-90">Request access</Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="max-w-[1240px] mx-auto px-6 pt-16 pb-14 grid lg:grid-cols-[1.25fr_0.75fr] gap-10 items-center">
        <div>
        <div className="inline-flex items-center gap-2 rounded-full border border-brand-border bg-brand-surface px-3.5 py-1.5 mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-marigold" />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/75">Digital twin &amp; remote operations · Maitri + Bharati</span>
        </div>
        <h1 className="font-display text-[44px] sm:text-[60px] lg:text-[68px] leading-[1.0] tracking-[-0.02em] max-w-[1000px] text-white">
          Two stations. Eleven thousand kilometres.{' '}
          <span className="italic text-cyan">One picture you can trust.</span>
        </h1>
        <p className="mt-8 max-w-[640px] text-[17px] leading-relaxed text-white/75">
          Himadri is the digital twin and remote-management platform for India&rsquo;s Antarctic research stations. It keeps working when the link doesn&rsquo;t, makes every action accountable, and shows the evidence behind every number.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          {isActive ? (
            <>
              <Link href={ROUTES.OVERVIEW} className="inline-flex items-center gap-2 rounded-xl bg-white text-brand-surface px-7 py-4 font-mono text-[12px] uppercase tracking-wider shadow-cyan-glow hover:opacity-90 transition">
                Enter mission control <ArrowRight size={15} />
              </Link>
              <StationEntryButtons />
            </>
          ) : (
            <>
              <Link href="/sign-in" className="inline-flex items-center gap-2 rounded-xl bg-white text-brand-surface px-7 py-4 font-mono text-[12px] uppercase tracking-wider shadow-cyan-glow hover:opacity-90 transition">
                Enter mission control <ArrowRight size={15} />
              </Link>
              <Link href="/sign-up" className="inline-flex items-center gap-2 rounded-xl border border-brand-border bg-brand-surface px-7 py-4 font-mono text-[12px] uppercase tracking-wider text-white/80 hover:border-cyan hover:text-cyan transition">
                Request access
              </Link>
            </>
          )}
        </div>
        </div>
        <div className="hidden lg:block">
          <PolarMap className="w-full h-auto" />
        </div>
      </section>

      {/* live evidence */}
      <section className="max-w-[1240px] mx-auto px-6 pb-6">
        <LiveStrip />
      </section>

      {/* constellation */}
      <section className="max-w-[1240px] mx-auto px-6 py-14">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
          <div>
            <p className="eyebrow">Live from the deployed backend</p>
            <h2 className="font-display text-[34px] leading-tight text-white mt-1">Every asset. Both stations. Right now.</h2>
          </div>
          <p className="font-mono text-[11px] text-white/70 max-w-sm">Each dot is a real asset in the twin graph — generator, tank, freezer, instrument, vehicle. Colour is its live status.</p>
        </div>
        <Constellation />
      </section>

      {/* pillars */}
      <section className="max-w-[1240px] mx-auto px-6 py-10">
        <div className="grid md:grid-cols-3 gap-5">
          {PILLARS.map((p) => (
            <Link key={p.tag} href={p.href} className="group panel p-7 flex flex-col hover:-translate-y-1 transition-transform">
              <span className="w-11 h-11 rounded-xl bg-cyan/10 text-cyan flex items-center justify-center mb-5">
                <p.icon size={20} />
              </span>
              <p className="eyebrow">{p.tag}</p>
              <h3 className="font-display text-[26px] leading-tight text-white mt-1">{p.title}</h3>
              <p className="text-[14px] text-white/75 leading-relaxed mt-3 flex-1">{p.body}</p>
              <p className="mt-6 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-cyan group-hover:gap-3 transition-all">
                {p.cta} <ArrowRight size={13} />
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* pipeline */}
      <section className="max-w-[1240px] mx-auto px-6 py-14">
        <p className="eyebrow">From sensor to decision</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-brand-border rounded-2xl overflow-hidden border border-brand-border mt-4">
          {STEPS.map((s) => (
            <div key={s.n} className="bg-brand-surface p-6">
              <p className="font-display text-[44px] leading-none text-marigold">{s.n}</p>
              <p className="font-display text-[22px] text-white mt-3">{s.t}</p>
              <p className="text-[13px] text-white/55 leading-relaxed mt-2">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* vs */}
      <section className="max-w-[1240px] mx-auto px-6 py-10">
        <div className="grid lg:grid-cols-[0.8fr_1.2fr] gap-10 items-start">
          <div>
            <p className="eyebrow">Not another dashboard</p>
            <h2 className="font-display text-[38px] leading-[1.05] text-white mt-2">Built like safety-critical software, not a demo.</h2>
            <p className="text-[14px] text-white/55 leading-relaxed mt-4">Antarctic stations lose their link for days, run on irreplaceable fuel and depend on a handful of people. The platform managing them has to be more careful than the dashboards we are used to.</p>
          </div>
          <div className="panel overflow-hidden">
            <div className="grid grid-cols-2 bg-brand-surface-2 px-5 py-3 border-b border-brand-border">
              <p className="eyebrow">A typical twin</p>
              <p className="eyebrow text-cyan">Himadri</p>
            </div>
            {VS.map(([a, b]) => (
              <div key={a} className="grid grid-cols-2 gap-6 px-5 py-4 border-b last:border-b-0 border-brand-border/70">
                <p className="text-[13.5px] text-white/65 line-through decoration-white/20">{a}</p>
                <p className="text-[13.5px] text-white">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* closing CTA */}
      <section className="max-w-[1240px] mx-auto px-6 py-16">
        <div className="rounded-3xl bg-white text-brand-surface px-8 py-12 sm:px-14 flex flex-wrap items-center justify-between gap-8">
          <div className="max-w-xl">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-marigold">PS 26060 · ISRO / NCPOR</p>
            <h2 className="font-display text-[36px] sm:text-[44px] leading-[1.05] mt-3">See the station the way HQ will.</h2>
          </div>
          <Link href={isActive ? ROUTES.OVERVIEW : '/sign-in'} className="inline-flex items-center gap-2 rounded-xl bg-marigold text-white px-7 py-4 font-mono text-[12px] uppercase tracking-wider hover:opacity-90 transition">
            Open mission control <ArrowRight size={15} />
          </Link>
        </div>
      </section>

      <footer className="border-t border-brand-border/70">
        <div className="max-w-[1240px] mx-auto px-6 py-8 flex flex-wrap items-center justify-between gap-4 font-mono text-[10px] uppercase tracking-widest text-white/62">
          <span className="inline-flex items-center gap-2"><Fingerprint size={13} /> Smart India Hackathon 2026 — PS 26060</span>
          <span className="inline-flex items-center gap-2"><Radio size={13} /> Maitri · Bharati · built to scale to Maitri-II</span>
        </div>
      </footer>
    </div>
  )
}
