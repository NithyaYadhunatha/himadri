// src/lib/nav/useNavGroups.ts
//
// Shared "which group/page is active" logic for Header.tsx (the primary
// group tabs) and Sidebar.tsx (that group's own pages) — both need the same
// answer from the same pathname, so it lives here once instead of being
// worked out twice.
'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { NAV_GROUPS, ADMIN_GROUP, type StationId } from '@/lib/constants'
import { useStationStore } from '@/store/useStationStore'

interface MeResponse {
  isAdmin?: boolean
  canViewAllStations?: boolean
  ownStation?: StationId | null
}

export interface NavItem {
  label: string
  href: string
}

export type NavGroup = { label: string; items: readonly NavItem[] }

/**
 * Picks the best-matching nav item for the current pathname. A plain
 * "exact-or-prefix" check breaks when one item's href is itself a prefix of
 * a SIBLING item's href — e.g. Station Twin's "2D Twin" (/twin) and "Floor
 * Plan" (/twin/floorplan) are siblings, not parent/child, but
 * `/twin/floorplan`.startsWith('/twin/') is true, so both used to light up
 * at once. Preferring the LONGEST matching href resolves that generically.
 */
export function findActiveItem(pathname: string, items: readonly NavItem[]): NavItem | undefined {
  let best: NavItem | undefined
  for (const item of items) {
    const matches = pathname === item.href || pathname.startsWith(item.href + '/')
    if (matches && (!best || item.href.length > best.href.length)) {
      best = item
    }
  }
  return best
}

export function useNavGroups() {
  const pathname = usePathname()
  const initFromMembership = useStationStore((s) => s.initFromMembership)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data: MeResponse) => {
        if (data.isAdmin) setIsAdmin(true)
        initFromMembership(data.ownStation ?? null, data.canViewAllStations ?? true)
      })
      .catch(() => {/* silently ignore — defaults to the switch-capable, non-admin view */ })
  }, [initFromMembership])

  const visibleGroups: readonly NavGroup[] = isAdmin ? [...NAV_GROUPS, ADMIN_GROUP] : NAV_GROUPS

  // Find the single best-matching item across every group's items (longest
  // href wins), then report whichever group owns it.
  let activeGroup: NavGroup = visibleGroups[0]
  let bestHref = ''
  for (const group of visibleGroups) {
    const match = findActiveItem(pathname, group.items)
    if (match && match.href.length > bestHref.length) {
      activeGroup = group
      bestHref = match.href
    }
  }
  const activeItem = findActiveItem(pathname, activeGroup.items)

  return { pathname, isAdmin, visibleGroups, activeGroup, activeItem }
}
