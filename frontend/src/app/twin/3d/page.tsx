'use client'

// The two Unity station twins are exported independently and served as static
// assets. The selected station controls which build is mounted; using the URL
// as the iframe key also disposes the previous Unity runtime when switching.

import { useEffect, useState } from 'react'
import { Box, ExternalLink } from 'lucide-react'
import { useStationStore } from '@/store/useStationStore'
import { ROUTES, STATION_LABELS, type StationId } from '@/lib/constants'

type UnityStatus = 'checking' | 'available' | 'unavailable'

const UNITY_BUILDS: Record<StationId, string> = {
  maitri: '/unity/index.html',
  bharati: '/unity/bharati/index.html',
}

export default function Twin3DPage() {
  const station = useStationStore((s) => s.station)
  const [buildCheck, setBuildCheck] = useState<{ url: string; status: Exclude<UnityStatus, 'checking'> } | null>(null)
  const unityBuildPath = UNITY_BUILDS[station]
  const backendApiUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://himadri.aus1in.me/api/v1'
  const backendUrl = new URL(backendApiUrl).origin
  const unityUrl = station === 'maitri'
    ? `${unityBuildPath}?backend=${encodeURIComponent(backendUrl)}`
    : unityBuildPath
  const stationLabel = STATION_LABELS[station]
  const status: UnityStatus = buildCheck?.url === unityUrl ? buildCheck.status : 'checking'

  useEffect(() => {
    let cancelled = false
    fetch(unityBuildPath, { method: 'HEAD' })
      .then((res) => {
        if (!cancelled) setBuildCheck({ url: unityUrl, status: res.ok ? 'available' : 'unavailable' })
      })
      .catch(() => {
        if (!cancelled) setBuildCheck({ url: unityUrl, status: 'unavailable' })
      })
    return () => { cancelled = true }
  }, [unityBuildPath, unityUrl])

  return (
    <div className="h-[calc(100vh-7rem)] flex flex-col bg-brand-bg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Box size={16} className="text-cyan" />
        <h1 className="font-mono text-xs font-bold text-white uppercase tracking-widest">
          3D Twin — {station.toUpperCase()}
        </h1>
      </div>

      <div className="flex-1 rounded border-2 border-dashed border-cyan/30 bg-brand-surface overflow-hidden relative">
        {status === 'available' ? (
          <iframe
            key={unityUrl}
            src={unityUrl}
            title={`${stationLabel} Unity WebGL 3D Station Twin`}
            className="w-full h-full border-0"
            allow="fullscreen"
            allowFullScreen
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-center gap-3 p-8">
            <div className="w-16 h-16 rounded-full bg-cyan/10 border border-cyan/30 flex items-center justify-center">
              <Box size={28} className="text-cyan/60" />
            </div>
            <p className="font-mono text-sm text-white/70 uppercase tracking-widest">
              {status === 'checking' ? `Loading ${stationLabel} 3D Twin…` : `${stationLabel} 3D Twin unavailable`}
            </p>
            <p className="text-xs text-white/40 font-sans max-w-md leading-relaxed">
              {status === 'checking'
                ? 'Checking the selected station build and preparing its Unity runtime.'
                : `The ${stationLabel} Unity WebGL build could not be loaded. You can continue with the 2D station twin.`}
            </p>
            <a
              href={ROUTES.TWIN}
              className="inline-flex items-center gap-1.5 text-[11px] font-mono text-cyan hover:underline mt-2"
            >
              <ExternalLink size={12} />
              View the 2D Station Twin instead
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
