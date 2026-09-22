'use client'

// Reserved slot for the Unity WebGL 3D station twin, which is being built
// separately (not in this Next.js app). Per explicit product direction, this
// page does NOT render its own Three.js scene — the old IT server-rack 3D
// view (components/facility3d/*, DigitalTwin3DView.tsx) was removed
// entirely for that reason. This just checks whether a Unity build has been
// dropped at /unity/index.html and embeds it in an iframe if so, falling
// back to a placeholder otherwise.

import { useEffect, useState } from 'react'
import { Box, ExternalLink } from 'lucide-react'
import { useStationStore } from '@/store/useStationStore'
import { ROUTES } from '@/lib/constants'

type UnityStatus = 'checking' | 'available' | 'unavailable'

export default function Twin3DPage() {
  const station = useStationStore((s) => s.station)
  const [status, setStatus] = useState<UnityStatus>('checking')

  useEffect(() => {
    let cancelled = false
    fetch('/unity/index.html', { method: 'HEAD' })
      .then((res) => {
        if (!cancelled) setStatus(res.ok ? 'available' : 'unavailable')
      })
      .catch(() => {
        if (!cancelled) setStatus('unavailable')
      })
    return () => { cancelled = true }
  }, [])

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
            src="/unity/index.html"
            title="Unity WebGL 3D Station Twin"
            className="w-full h-full border-0"
            allow="fullscreen"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-center gap-3 p-8">
            <div className="w-16 h-16 rounded-full bg-cyan/10 border border-cyan/30 flex items-center justify-center">
              <Box size={28} className="text-cyan/60" />
            </div>
            <p className="font-mono text-sm text-white/70 uppercase tracking-widest">
              3D Twin — Unity WebGL build in progress
            </p>
            <p className="text-xs text-white/40 font-sans max-w-md leading-relaxed">
              The real-time 3D station model is being built separately in Unity and will integrate here once its
              WebGL build is published to <code className="text-cyan/70">/unity/index.html</code> in this app&apos;s
              public directory. This page reserves the slot and will render it automatically once available
              {status === 'checking' ? ' — checking now…' : '.'}
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
