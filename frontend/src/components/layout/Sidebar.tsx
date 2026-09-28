// src/components/layout/Sidebar.tsx
//
// Single left-hand nav replacing the old two-row Navbar (a top group-tab bar
// stacked on a second sub-nav bar). Same data/logic (NAV_GROUPS, admin gate,
// station switch/lock, membership sync) — just laid out as one vertical rail
// with every group's items visible underneath it, instead of splitting
// "which group" and "which page in that group" across two separate bars.
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FlaskConical, Lock, Clock } from 'lucide-react'
import { useState, useEffect } from 'react'
import { UserButton } from '@clerk/nextjs'
import { ROUTES, NAV_GROUPS, ADMIN_GROUP, LIVE_ASSET_COUNT, STATIONS, STATION_LABELS, type StationId } from '@/lib/constants'
import { useStationStore } from '@/store/useStationStore'
import { DEV_BYPASS_AUTH, MOCK_MEMBERSHIP } from '@/lib/auth/devBypass'
import { HimadriMark } from '@/components/ui/HimadriMark'

interface MeResponse {
  isAdmin?: boolean
  canViewAllStations?: boolean
  ownStation?: StationId | null
}

interface NavItem {
  label: string
  href: string
}

/** Same "longest-href-wins" match as the old Navbar — /twin/floorplan and
 * /twin are siblings, not parent/child, so a plain prefix check would light
 * both up at once. */
function findActiveItem(pathname: string, items: readonly NavItem[]): NavItem | undefined {
  let best: NavItem | undefined
  for (const item of items) {
    const matches = pathname === item.href || pathname.startsWith(item.href + '/')
    if (matches && (!best || item.href.length > best.href.length)) {
      best = item
    }
  }
  return best
}

export function Sidebar() {
  const pathname = usePathname()
  const station = useStationStore((s) => s.station)
  const canSwitch = useStationStore((s) => s.canSwitch)
  const setStation = useStationStore((s) => s.setStation)
  const initFromMembership = useStationStore((s) => s.initFromMembership)

  const [time, setTime] = useState<Date | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    setTime(new Date())
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data: MeResponse) => {
        if (data.isAdmin) setIsAdmin(true)
        initFromMembership(data.ownStation ?? null, data.canViewAllStations ?? true)
      })
      .catch(() => {/* silently ignore — defaults to the switch-capable, non-admin view */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visibleGroups = isAdmin ? [...NAV_GROUPS, ADMIN_GROUP] : NAV_GROUPS

  type NavGroup = { label: string; items: readonly NavItem[] }
  const groups: readonly NavGroup[] = visibleGroups
  let activeGroupLabel = groups[0]?.label
  let bestHref = ''
  for (const group of groups) {
    const match = findActiveItem(pathname, group.items)
    if (match && match.href.length > bestHref.length) {
      activeGroupLabel = group.label
      bestHref = match.href
    }
  }

  return (
    <aside className="flex flex-col w-56 shrink-0 h-screen bg-brand-surface border-r border-brand-border relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.10] pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(#B9D6E6 1px, transparent 1px), linear-gradient(90deg, #B9D6E6 1px, transparent 1px)',
          backgroundSize: '14px 14px',
        }}
      />

      <Link href="/" className="flex items-center gap-2.5 shrink-0 relative z-10 px-4 py-4 border-b border-brand-border">
        <div className="w-8 h-8 rounded-lg bg-cyan/10 border border-cyan/40 flex items-center justify-center shadow-cyan-glow shrink-0">
          <HimadriMark className="w-[18px] h-[18px] text-cyan" />
        </div>
        <div className="flex flex-col leading-none min-w-0">
          <span className="font-mono font-bold text-white text-sm tracking-widest truncate">HIMADRI</span>
          <span className="font-mono text-[8px] text-cyan/70 tracking-widest uppercase mt-0.5">SIH 2026</span>
        </div>
      </Link>

      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-4 relative z-10">
        {visibleGroups.map((group) => {
          const isActiveGroup = group.label === activeGroupLabel
          return (
            <div key={group.label}>
              <p
                className={`font-mono text-[9.5px] uppercase tracking-widest px-2 mb-1.5 ${
                  isActiveGroup ? 'text-cyan font-bold' : 'text-white/35'
                }`}
              >
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = item.href === findActiveItem(pathname, group.items)?.href
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`relative flex items-center gap-2 pl-3 pr-2.5 py-1.5 rounded-md font-mono text-[11px] tracking-wide transition-colors ${
                        isActive
                          ? 'bg-cyan/10 text-cyan font-bold'
                          : 'text-white/55 hover:text-white hover:bg-brand-surface-2'
                      }`}
                    >
                      {isActive && <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-cyan" />}
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>

      <div className="shrink-0 border-t border-brand-border p-2.5 space-y-2 relative z-10">
        {canSwitch ? (
          <div className="flex items-center rounded-md border border-brand-border overflow-hidden w-full" title="Switch station">
            {STATIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStation(s)}
                className={`flex-1 font-mono text-[10px] uppercase tracking-wider px-2 py-1.5 transition-colors ${
                  station === s ? 'bg-cyan/20 text-cyan font-bold' : 'text-white/40 hover:text-white/70'
                }`}
              >
                {STATION_LABELS[s]}
              </button>
            ))}
          </div>
        ) : (
          <div
            className="flex items-center justify-center gap-1.5 rounded-md border border-brand-border bg-brand-surface-2 px-2.5 py-1.5 w-full"
            title="Your account is scoped to this station only"
          >
            <Lock size={10} className="text-white/40" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-white/70 font-bold">{STATION_LABELS[station]}</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 border border-emerald/30 bg-emerald/10 rounded-md px-2 py-1.5 min-w-0">
            <span className="relative flex items-center justify-center shrink-0">
              <span className="absolute w-2 h-2 rounded-full bg-emerald animate-ping opacity-75" />
              <span className="relative w-1.5 h-1.5 rounded-full bg-emerald" />
            </span>
            <span className="font-mono text-[9px] text-emerald font-bold tracking-widest leading-none truncate">{LIVE_ASSET_COUNT} ASSETS</span>
          </div>

          {DEV_BYPASS_AUTH ? (
            <div
              className="relative flex items-center justify-center w-7 h-7 shrink-0 rounded-full bg-brand-surface-2 border border-brand-border cursor-help"
              title={`Auth bypassed for local testing — acting as ${MOCK_MEMBERSHIP.name} (${MOCK_MEMBERSHIP.role})`}
            >
              <FlaskConical size={12} className="text-white/40" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber border border-brand-surface" />
            </div>
          ) : (
            <UserButton />
          )}
        </div>

        <div className="flex items-center gap-1.5 justify-center font-mono text-[10px] text-white/40 tracking-wider tabular-nums pt-0.5">
          <Clock size={10} />
          {time ? time.toLocaleTimeString('en-US', { hour12: false }) : '--:--:--'}
        </div>
      </div>
    </aside>
  )
}
