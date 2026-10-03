// src/components/layout/Header.tsx
//
// The single top bar: logo, primary group tabs, and the right-hand cluster
// (station switch/lock, live-asset badge, clock, user). The active group's
// own pages used to live in a second bar stacked right under this one —
// they're now Sidebar.tsx instead, so this is one header row, not two.
'use client'

import Link from 'next/link'
import { FlaskConical, Lock } from 'lucide-react'
import { useState, useEffect } from 'react'
import { UserButton } from '@clerk/nextjs'
import { LIVE_ASSET_COUNT, STATIONS, STATION_LABELS } from '@/lib/constants'
import { useStationStore } from '@/store/useStationStore'
import { DEV_BYPASS_AUTH, MOCK_MEMBERSHIP } from '@/lib/auth/devBypass'
import { HimadriMark } from '@/components/ui/HimadriMark'
import { useNavGroups } from '@/lib/nav/useNavGroups'

export function Header() {
  const station = useStationStore((s) => s.station)
  const canSwitch = useStationStore((s) => s.canSwitch)
  const setStation = useStationStore((s) => s.setStation)
  const { visibleGroups, activeGroup } = useNavGroups()

  const [time, setTime] = useState<Date | null>(null)

  useEffect(() => {
    setTime(new Date())
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <header className="h-14 shrink-0 z-30 bg-brand-surface border-b border-brand-border grid grid-cols-[1fr_auto_1fr] items-center gap-6 px-5 relative overflow-hidden shadow-[0_4px_20px_rgba(22,40,58,0.10)]">
      {/* Faint dot-grid texture — sits behind everything, never intercepts clicks. */}
      <div
        className="absolute inset-0 opacity-[0.12] pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(#B9D6E6 1px, transparent 1px), linear-gradient(90deg, #B9D6E6 1px, transparent 1px)',
          backgroundSize: '14px 14px',
        }}
      />

      {/* Logo — left grid column. */}
      <Link href="/" className="flex items-center gap-2.5 shrink-0 relative z-10 justify-self-start">
        <div className="w-8 h-8 rounded-lg bg-cyan/10 border border-cyan/40 flex items-center justify-center shadow-cyan-glow">
          <HimadriMark className="w-[18px] h-[18px] text-cyan" />
        </div>
        <div className="hidden sm:flex flex-col leading-none">
          <span className="font-mono font-bold text-white text-sm tracking-widest">HIMADRI</span>
          <span className="font-mono text-[10px] text-cyan/70 tracking-widest uppercase mt-0.5">SIH 2026</span>
        </div>
      </Link>

      {/* Primary group tabs — middle grid column, true row-center. Picking
          one moves the Sidebar over to that group's own pages. */}
      <nav className="flex items-center gap-1 h-full overflow-x-auto min-w-0 relative z-10">
        {visibleGroups.map((group) => {
          const isActive = group.label === activeGroup.label
          return (
            <Link
              key={group.label}
              href={group.items[0].href}
              className={`font-mono text-[11px] tracking-widest uppercase transition-all flex items-center h-full relative px-3 whitespace-nowrap rounded-md ${
                isActive ? 'text-cyan bg-cyan/10 font-bold' : 'text-white/65 hover:text-white/80 hover:bg-brand-surface-2'
              }`}
            >
              {group.label}
            </Link>
          )
        })}
      </nav>

      {/* Right cluster — right grid column */}
      <div className="flex items-center gap-3 shrink-0 relative z-10 justify-self-end">
        {canSwitch ? (
          <div className="flex items-center rounded-md border border-brand-border overflow-hidden shrink-0" title="Switch station">
            {STATIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStation(s)}
                className={`font-mono text-[10px] uppercase tracking-wider px-2 py-1.5 transition-colors ${
                  station === s ? 'bg-cyan/20 text-cyan font-bold' : 'text-white/62 hover:text-white/70'
                }`}
              >
                {STATION_LABELS[s]}
              </button>
            ))}
          </div>
        ) : (
          <div
            className="flex items-center gap-1.5 rounded-md border border-brand-border bg-brand-surface-2 px-2.5 py-1.5"
            title="Your account is scoped to this station only"
          >
            <Lock size={10} className="text-white/62" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-white/70 font-bold">{STATION_LABELS[station]}</span>
          </div>
        )}

        <div className="hidden xl:flex items-center gap-2 border border-emerald/30 bg-emerald/10 rounded-md px-2.5 py-1.5">
          <span className="relative flex items-center justify-center">
            <span className="absolute w-2 h-2 rounded-full bg-emerald animate-ping opacity-75" />
            <span className="relative w-1.5 h-1.5 rounded-full bg-emerald" />
          </span>
          <span className="font-mono text-[10px] text-emerald font-bold tracking-widest leading-none">{LIVE_ASSET_COUNT} ASSETS</span>
        </div>

        <span className="hidden 2xl:inline font-mono text-[10px] text-white/62 tracking-wider tabular-nums">
          {time ? time.toLocaleTimeString('en-US', { hour12: false }) : '--:--:--'}
        </span>

        {DEV_BYPASS_AUTH ? (
          <div
            className="relative flex items-center justify-center w-7 h-7 rounded-full bg-brand-surface-2 border border-brand-border cursor-help"
            title={`Auth bypassed for local testing — acting as ${MOCK_MEMBERSHIP.name} (${MOCK_MEMBERSHIP.role})`}
          >
            <FlaskConical size={12} className="text-white/62" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber border border-brand-surface" />
          </div>
        ) : (
          <UserButton />
        )}
      </div>
    </header>
  )
}
