'use client'

// Landing page's direct Maitri/Bharati entry points. Real per-station Clerk
// auth (each station's Leader/Engineer/Scientist signing in against their
// own org/scope) is future work — for now, under DEV_BYPASS_AUTH, "pick a
// station" is a pre-auth choice that precedes RBAC lock-in, so this uses
// forceSetStation (bypasses the store's normal canSwitch guard — the mock
// membership is otherwise hard-locked to Maitri, which is what made these
// buttons silently no-op on Bharati before) rather than setStation. Once
// real per-station accounts exist, each button becomes its own Clerk
// sign-in flow scoped to that station's org and this reverts to setStation.
import { useRouter } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { useStationStore } from '@/store/useStationStore'
import { STATIONS, STATION_LABELS, ROUTES, type StationId } from '@/lib/constants'

export function StationEntryButtons() {
  const router = useRouter()
  const forceSetStation = useStationStore((s) => s.forceSetStation)

  const enter = (station: StationId) => {
    forceSetStation(station)
    router.push(ROUTES.MISSION)
  }

  return (
    <div className="flex flex-col sm:flex-row items-center gap-3">
      {STATIONS.map((s) => (
        <button
          key={s}
          onClick={() => enter(s)}
          className="inline-flex items-center gap-2.5 font-mono text-[12px] uppercase tracking-wider bg-brand-surface border border-brand-border text-white rounded-xl px-6 py-4 hover:border-cyan hover:text-cyan active:scale-95 transition-all group"
        >
          <Building2 size={16} className="text-cyan/70 group-hover:text-cyan transition-colors" />
          {STATION_LABELS[s]}
        </button>
      ))}
    </div>
  )
}
