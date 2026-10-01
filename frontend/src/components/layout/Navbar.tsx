// src/components/layout/Navbar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FlaskConical, Lock } from 'lucide-react'
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

/**
 * Picks the best-matching nav item for the current pathname. A plain
 * "exact-or-prefix" check breaks when one item's href is itself a prefix of
 * a SIBLING item's href — e.g. Station Twin's "2D Twin" (/twin) and "Floor
 * Plan" (/twin/floorplan) are siblings, not parent/child, but
 * `/twin/floorplan`.startsWith('/twin/') is true, so both used to light up
 * at once. Preferring the LONGEST matching href resolves that generically
 * (the more specific route always wins) while still letting a genuinely
 * nested detail page — e.g. /assets/[id]/passport under "Assets" (/assets)
 * — correctly highlight its parent tab.
 */
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

export function Navbar() {
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

  // ADMIN only ever appears as its own tab — never injected into another
  // group's sub-nav, so every other page stays free of Team/Devices/Audit.
  const visibleGroups = isAdmin ? [...NAV_GROUPS, ADMIN_GROUP] : NAV_GROUPS

  // Find the single best-matching item across every group's items (longest
  // href wins — see findActiveItem), then report whichever group owns it.
  // Widened to a plain NavGroup[] here (rather than threading the exact
  // per-group literal-tuple types through) since all we need back out is
  // which group/item matched, not their precise `label`/`href` literal
  // types.
  type NavGroup = { label: string; items: readonly NavItem[] }
  const groups: readonly NavGroup[] = visibleGroups
  let activeGroup: NavGroup = groups[0]
  let bestHref = ''
  for (const group of groups) {
    const match = findActiveItem(pathname, group.items)
    if (match && match.href.length > bestHref.length) {
      activeGroup = group
      bestHref = match.href
    }
  }
  const activeItem = findActiveItem(pathname, activeGroup.items)

  return (
    <div className="flex flex-col w-full z-30 shrink-0 shadow-[0_4px_20px_rgba(28,31,51,0.10)] relative">
      {/* ─── Top Navbar ────────────────────────────────────────────── */}
      <header className="h-14 bg-brand-surface border-b border-brand-border grid grid-cols-[1fr_auto_1fr] items-center gap-6 px-5 relative overflow-hidden">
        {/* Faint dot-grid texture — the header's original design language,
            dropped during an earlier polish pass and restored here. Sits
            behind everything, never intercepts clicks. */}
        <div
          className="absolute inset-0 opacity-[0.12] pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(#DDD5C2 1px, transparent 1px), linear-gradient(90deg, #DDD5C2 1px, transparent 1px)',
            backgroundSize: '14px 14px',
          }}
        />

        {/* Logo — left grid column. A plain flex `justify-center` nav in the
            middle column only centers on the TRUE row midpoint when the left
            and right columns are equal width; here they aren't (the right
            cluster is wider than the logo), which used to visibly pull the
            primary nav left of where the sub-nav row (which has no side
            columns to fight) centers itself. The 1fr/auto/1fr grid below
            fixes that structurally — both side columns absorb leftover
            space equally, so the middle column is always the row's true
            center regardless of how wide the logo or right cluster are. */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0 relative z-10 justify-self-start">
          <div className="w-8 h-8 rounded-[9px] bg-white text-brand-surface flex items-center justify-center shadow-cyan-glow">
            <HimadriMark className="w-[19px] h-[19px] text-marigold" />
          </div>
          <div className="hidden sm:flex flex-col leading-none">
            <span className="font-display font-semibold text-white text-[19px] tracking-tight">Himadri</span>
            <span className="font-mono text-[8px] text-white/45 tracking-[0.22em] uppercase mt-0.5">Station Command</span>
          </div>
        </Link>

        {/* Primary group tabs — middle grid column, true row-center. */}
        <nav className="flex items-center gap-1 h-full overflow-x-auto min-w-0 relative z-10">
          {visibleGroups.map((group) => {
            const isActive = group.label === activeGroup.label
            return (
              <Link
                key={group.label}
                href={group.items[0].href}
                className={`font-mono text-[11px] tracking-widest uppercase transition-all flex items-center h-full relative px-3 whitespace-nowrap rounded-md ${
                  isActive ? 'text-cyan bg-cyan/10 font-bold' : 'text-white/45 hover:text-white/80 hover:bg-brand-surface-2'
                }`}
              >
                {group.label}
              </Link>
            )
          })}
        </nav>

        {/* Right cluster — right grid column */}
        <div className="flex items-center gap-3 shrink-0 relative z-10 justify-self-end">
          {/* Station: a locked static badge for station-scoped roles, a
              switcher only for roles that can actually see both stations. */}
          {canSwitch ? (
            <div className="flex items-center rounded-md border border-brand-border overflow-hidden shrink-0" title="Switch station">
              {STATIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStation(s)}
                  className={`font-mono text-[10px] uppercase tracking-wider px-2 py-1.5 transition-colors ${
                    station === s ? 'bg-cyan/20 text-cyan font-bold' : 'text-white/40 hover:text-white/70'
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
              <Lock size={10} className="text-white/40" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-white/70 font-bold">{STATION_LABELS[station]}</span>
            </div>
          )}

          <div className="hidden xl:flex items-center gap-2 border border-emerald/30 bg-emerald/10 rounded-md px-2.5 py-1.5">
            <span className="relative flex items-center justify-center">
              <span className="absolute w-2 h-2 rounded-full bg-emerald animate-ping opacity-75" />
              <span className="relative w-1.5 h-1.5 rounded-full bg-emerald" />
            </span>
            <span className="font-mono text-[9px] text-emerald font-bold tracking-widest leading-none">{LIVE_ASSET_COUNT} ASSETS</span>
          </div>

          <span className="hidden 2xl:inline font-mono text-[10px] text-white/40 tracking-wider tabular-nums">
            {time ? time.toLocaleTimeString('en-US', { hour12: false }) : '--:--:--'}
          </span>

          {DEV_BYPASS_AUTH ? (
            <div
              className="relative flex items-center justify-center w-7 h-7 rounded-full bg-brand-surface-2 border border-brand-border cursor-help"
              title={`Auth bypassed for local testing — acting as ${MOCK_MEMBERSHIP.name} (${MOCK_MEMBERSHIP.role})`}
            >
              <FlaskConical size={12} className="text-white/40" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber border border-brand-surface" />
            </div>
          ) : (
            <UserButton />
          )}
        </div>
      </header>

      {/* ─── Secondary Sub-Nav — ONLY the active group's own items ───── */}
      <div className="h-10 bg-brand-surface-2 border-b border-brand-border flex items-center justify-center px-5 overflow-hidden">
        <nav className="flex items-center gap-7 h-full overflow-x-auto">
          {activeGroup.items.map((item) => {
            const isActive = item.href === activeItem?.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex items-center h-full transition-colors whitespace-nowrap ${
                  isActive ? 'text-cyan font-bold' : 'text-white/45 hover:text-white/80'
                }`}
              >
                <span className="font-mono text-[10.5px] uppercase tracking-widest">{item.label}</span>
                {isActive && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan rounded-t-sm" />}
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
