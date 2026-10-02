'use client'

import { Box } from 'lucide-react'
import Link from 'next/link'
import { memo, useEffect, useRef, useState } from 'react'
import { ROUTES, STATION_LABELS, type StationId } from '@/lib/constants'
import { digitalTwinBridge } from '@/lib/twin/bridge'
import { useTwin } from '@/lib/twin/store'

const UNITY_BUILDS: Record<StationId, string> = {
  maitri: '/unity/index.html',
  bharati: '/unity/bharati/index.html',
}

/** Memoised: telemetry updates must never re-render the Unity iframe. */
export const TwinViewport = memo(function TwinViewport({ station }: { station: StationId }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const setScene = useTwin((s) => s.setScene)
  const scene = useTwin((s) => s.scene)
  const [available, setAvailable] = useState<'checking' | 'yes' | 'no'>('checking')
  const buildPath = UNITY_BUILDS[station]
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://himadri.aus1in.me/api/v1'
  const url = station === 'maitri'
    ? `${buildPath}?backend=${encodeURIComponent(new URL(apiBase).origin)}&commandApi=${encodeURIComponent('/api/digital-twin/command')}`
    : buildPath

  useEffect(() => {
    let cancelled = false
    setScene('loading'); setAvailable('checking')
    fetch(buildPath, { method: 'HEAD' })
      .then((r) => { if (!cancelled) { setAvailable(r.ok ? 'yes' : 'no'); if (!r.ok) setScene('error') } })
      .catch(() => { if (!cancelled) { setAvailable('no'); setScene('error') } })
    return () => { cancelled = true }
  }, [buildPath, setScene])

  useEffect(() => {
    const onMsg = (e: MessageEvent) => digitalTwinBridge.handleMessage(e)
    window.addEventListener('message', onMsg)
    return () => { window.removeEventListener('message', onMsg); digitalTwinBridge.attach(null) }
  }, [])

  return (
    <div className="tw-viewport">
      {available === 'yes' && (
        <iframe
          ref={ref}
          key={url}
          src={url}
          title={`${STATION_LABELS[station]} Unity WebGL 3D station twin`}
          allow="fullscreen"
          allowFullScreen
          onLoad={() => { digitalTwinBridge.attach(ref.current); setScene('ready') }}
        />
      )}
      {available !== 'yes' && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24 }}>
          <div>
            <Box size={30} color="#64748B" />
            <p className="tw-mono" style={{ margin: '10px 0 4px', letterSpacing: '.12em', textTransform: 'uppercase' }}>
              {available === 'checking' ? `Loading ${STATION_LABELS[station]} 3D twin…` : `${STATION_LABELS[station]} 3D twin failed to load`}
            </p>
            {available === 'no' && <Link href={ROUTES.TWIN} style={{ color: '#BEF264', fontSize: 11 }}>Open the 2D station twin instead</Link>}
          </div>
        </div>
      )}
      {available === 'yes' && scene === 'loading' && <div className="tw-sub" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none' }}>Starting 3D scene…</div>}
    </div>
  )
})
