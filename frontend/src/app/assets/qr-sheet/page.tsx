'use client'

// Printable grid of QR codes, one per asset, each linking to that asset's
// /assets/[id]/passport page — meant to be printed and physically stuck on
// equipment so a technician can scan it in the field (SRS FR-95). A basic
// @media print stylesheet strips the page chrome so only the sheet prints.

import { useState, useEffect, useMemo } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Printer } from 'lucide-react'
import Image from 'next/image'
import { Button } from '@/components/ui/Button'
import { InlineLoader, ErrorState } from '@/components/ui/Loader'
import { nodeHealthService } from '@/services/nodeHealth.service'
import { STATIONS, STATION_LABELS, ASSET_CATEGORY_ABBREV } from '@/lib/constants'
import { getNodeTypeConfig } from '@/lib/graph/nodeTypes'
import type { NodeHealth } from '@/types/nodes'

function AssetCard({ asset, origin }: { asset: NodeHealth; origin: string }) {
  const { color } = getNodeTypeConfig(asset.type)
  return (
    <div className="relative bg-[#FFFFFF] rounded-lg overflow-hidden flex flex-col items-center gap-2 border border-brand-border print:border-black/30 shadow-sm print:shadow-none">
      <div className="w-full h-1.5" style={{ background: color }} />
      <div className="flex flex-col items-center gap-2 px-3 pb-3 pt-1">
        <QRCodeSVG value={`${origin}/assets/${asset.id}/passport`} size={92} level="M" />
        <p className="text-[10px] font-mono font-semibold text-black text-center leading-tight max-w-[130px]">{asset.name}</p>
        <div className="flex items-center gap-1">
          <span className="text-[8px] font-mono uppercase tracking-wider text-white px-1.5 py-0.5 rounded" style={{ background: color }}>
            {ASSET_CATEGORY_ABBREV[asset.type] ?? asset.type}
          </span>
          <span className="text-[8px] font-mono text-black/40 uppercase">{asset.stationId}</span>
        </div>
        <p className="text-[7px] font-mono text-black/30 tracking-wider">{asset.id}</p>
      </div>
    </div>
  )
}

export default function QrSheetPage() {
  const [assets, setAssets] = useState<NodeHealth[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stationFilter, setStationFilter] = useState<string>('')
  const [origin, setOrigin] = useState('')

  useEffect(() => {
    if (typeof window !== 'undefined') setOrigin(window.location.origin)
  }, [])

  useEffect(() => {
    nodeHealthService.getNodes({})
      .then(setAssets)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load assets'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(
    () => (stationFilter ? assets.filter((a) => a.stationId === stationFilter) : assets),
    [assets, stationFilter],
  )

  const groups = useMemo(() => {
    const byStation = new Map<string, NodeHealth[]>()
    for (const a of filtered) {
      const key = a.stationId ?? 'unknown'
      if (!byStation.has(key)) byStation.set(key, [])
      byStation.get(key)!.push(a)
    }
    return [...byStation.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  return (
    <div className="min-h-full bg-brand-bg p-6 print:p-0 print:bg-white">
      <style>{`
        @media print {
          nav, header, .no-print { display: none !important; }
          body { background: white !important; }
          .print-section { break-inside: avoid; }
        }
      `}</style>

      <div className="flex items-center justify-between mb-6 no-print">
        <div>
          <h1 className="font-mono text-sm font-bold text-white uppercase tracking-widest">Asset QR Sheet</h1>
          <p className="text-white/40 text-xs mt-1 font-sans">
            A printable reference sheet — cut out each code and affix it to the physical asset. Scanning it opens that asset&rsquo;s passport (identity, telemetry, maintenance log).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={stationFilter} onChange={(e) => setStationFilter(e.target.value)} className="bg-brand-surface border border-brand-border rounded px-2 py-1.5 text-xs font-mono text-white/70 focus:outline-none focus:border-cyan/50">
            <option value="">All stations</option>
            {STATIONS.map((s) => <option key={s} value={s}>{STATION_LABELS[s]}</option>)}
          </select>
          <Button variant="primary" size="sm" icon={<Printer size={13} />} onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </div>

      {loading && <div className="flex justify-center py-16 no-print"><InlineLoader text="Loading assets…" /></div>}
      {error && <div className="no-print"><ErrorState message={error} /></div>}

      {!loading && !error && (
        <div className="max-w-5xl mx-auto space-y-8">
          {/* Print-only masthead — gives the printed sheet its own header
              rather than looking like a raw card dump. */}
          <div className="hidden print:flex items-center justify-between border-b-2 border-black pb-2 mb-2">
            <div className="flex items-center gap-2">
              <Image src="/himadri-logo.png" alt="HIMADRI" width={945} height={268} className="h-8 w-auto" />
              <span className="font-bold text-sm tracking-widest">ASSET QR SHEET</span>
            </div>
            <span className="font-mono text-[10px] text-black/50">{new Date().toLocaleDateString()} · {filtered.length} assets</span>
          </div>

          {groups.map(([stationId, stationAssets]) => (
            <div key={stationId} className="print-section">
              <div className="flex items-center gap-2 mb-3">
                <span className="font-mono text-xs font-bold text-white print:text-black uppercase tracking-widest">
                  {STATION_LABELS[stationId as keyof typeof STATION_LABELS] ?? stationId}
                </span>
                <span className="h-px flex-1 bg-brand-border print:bg-black/20" />
                <span className="font-mono text-[10px] text-white/30 print:text-black/40">{stationAssets.length}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 print:grid-cols-3">
                {stationAssets.map((asset) => (
                  <AssetCard key={asset.id} asset={asset} origin={origin} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
