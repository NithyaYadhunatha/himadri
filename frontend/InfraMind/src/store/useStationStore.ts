// src/store/useStationStore.ts
//
// Which station (Maitri/Bharati) the current viewer is looking at. A
// Station Leader/Engineer/Scientist is permanently locked to their own
// station — no switcher shown, and `setStation` is a no-op for them; only
// an HQ Operator/Auditor/Admin membership (canSwitch === true) can move
// between stations. This mirrors the server-side enforcement in
// lib/graph/departmentScope.ts, which every station-scoped proxy route
// checks independently — the store is a client-side convenience, not the
// authority, so a locked user could never actually fetch the other
// station's data even if this state were tampered with.
//
// Persisted to localStorage so a reload keeps the last-picked station; the
// Navbar re-syncs `canSwitch`/the locked value from /api/auth/me on mount.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { STATIONS, type StationId } from '@/lib/constants'

interface StationState {
  station: StationId
  canSwitch: boolean
  initialized: boolean
  /** True once forceSetStation has been called this session — tells
   * initFromMembership not to clobber the forced station when a Navbar
   * mounts afterward (see forceSetStation's comment for why that matters).
   * Deliberately sticky for the rest of the session rather than a one-shot
   * flag cleared after the first sync: React 18 Strict Mode double-invokes
   * effects in dev, so Navbar's membership-sync fetch fires twice — a
   * one-shot flag gets consumed by the first resolution and is already gone
   * by the second, which then clobbers the station right back. Not
   * persisted on purpose: a hard reload should go back to respecting the
   * real lock. */
  forced: boolean
  setStation: (station: StationId) => void
  /** Bypasses the canSwitch lock entirely — for the landing page's direct
   * Maitri/Bharati entry buttons (src/components/landing/StationEntryButtons.tsx)
   * under DEV_BYPASS_AUTH only, where "pick a station" is a pre-auth choice
   * that precedes RBAC lock-in (real per-station Clerk auth is future work —
   * see that component's own comment).
   *
   * The landing page doesn't mount Navbar (it has its own lightweight
   * header), so the FIRST time Navbar mounts is typically right after this
   * runs (on whatever page router.push lands on) — its membership-sync
   * effect would otherwise immediately call initFromMembership and snap a
   * locked mock membership's station straight back, making this button look
   * like it silently no-ops on the locked station. Setting `forced: true`
   * tells initFromMembership to leave `station` alone the next time it
   * runs, so the forced choice actually sticks.
   */
  forceSetStation: (station: StationId) => void
  initFromMembership: (ownStation: StationId | null, canSwitch: boolean) => void
}

export const useStationStore = create<StationState>()(
  persist(
    (set, get) => ({
      station: STATIONS[0],
      canSwitch: true,
      initialized: false,
      forced: false,

      setStation: (station) => {
        if (!get().canSwitch) return
        set({ station })
      },

      forceSetStation: (station) => set({ station, canSwitch: true, forced: true }),

      initFromMembership: (ownStation, canSwitch) => {
        set((state) => ({
          canSwitch,
          // A locked user always snaps to their real station, overriding
          // whatever was persisted (e.g. from a previous, differently-
          // scoped account on the same browser) — UNLESS a dev-mode
          // forceSetStation just ran and hasn't been through a mount cycle
          // yet, in which case the forced choice wins this one time. A
          // switch-capable user keeps their last-picked station across
          // reloads either way.
          station: state.forced || canSwitch ? state.station : (ownStation ?? state.station),
          initialized: true,
        }))
      },
    }),
    { name: 'himadri-station', partialize: (state) => ({ station: state.station, canSwitch: state.canSwitch }) },
  ),
)
