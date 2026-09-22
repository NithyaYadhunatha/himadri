// src/components/nodes/ConnectNodeModal.tsx
'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ServerCog, KeyRound, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { CopyField } from '@/components/ui/CopyField'
import { nodeAdminService } from '@/services/nodeAdmin.service'
import { nodeTypeConfig } from '@/lib/graph/nodeTypes'
import { STATIONS, STATION_LABELS, type StationId } from '@/lib/constants'
import type { NodeType } from '@/types/graph'

const CATEGORY_OPTIONS = (Object.keys(nodeTypeConfig) as NodeType[]).filter((t) => t !== 'custom')

interface ConnectNodeModalProps {
  open: boolean
  onClose: () => void
  onCreated?: () => void
}

export function ConnectNodeModal({ open, onClose, onCreated }: ConnectNodeModalProps) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<NodeType>(CATEGORY_OPTIONS[0])
  const [subtype, setSubtype] = useState('')
  const [station, setStation] = useState<StationId>(STATIONS[0])
  const [zoneId, setZoneId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ node_id: string; api_key: string } | null>(null)

  useEffect(() => {
    if (!open) return
    setName('')
    setCategory(CATEGORY_OPTIONS[0])
    setSubtype('')
    setStation(STATIONS[0])
    setZoneId('')
    setError(null)
    setResult(null)
    setSubmitting(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Asset name is required.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const created = await nodeAdminService.createNode({
        name: name.trim(),
        station_id: station,
        category,
        subtype: subtype.trim() || undefined,
        zone_id: zoneId.trim() || undefined,
      })
      setResult({ node_id: created.node_id, api_key: created.api_key })
      onCreated?.()
    } catch (err) {
      const message = (err as { message?: string })?.message ?? 'Failed to create asset'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', damping: 28, stiffness: 340 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[420px] max-w-[92vw] bg-brand-surface border border-brand-border rounded shadow-2xl"
          >
            <div className="flex items-start justify-between p-4 border-b border-brand-border">
              <div className="flex items-center gap-2">
                {result ? <KeyRound size={16} className="text-cyan" /> : <ServerCog size={16} className="text-cyan" />}
                <h2 className="font-mono text-sm font-semibold tracking-wider text-white uppercase">
                  {result ? 'Asset Registered' : 'Register New Asset'}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="text-white/40 hover:text-white transition-colors p-1 rounded hover:bg-white/5"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {!result ? (
                <>
                  <p className="text-xs font-sans text-white/50">
                    Creates an asset record on the backend. Copy the Asset ID + API Key it returns into the device
                    manifest for the physical sensor/agent you want to monitor it with (see Admin → Devices) — this
                    only creates the record, it does not register a device.
                  </p>

                  <div>
                    <label className="font-mono text-[10px] text-white/40 uppercase tracking-widest mb-1 block">
                      Asset Name
                    </label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Diesel Generator 4"
                      className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-cyan/60"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-mono text-[10px] text-white/40 uppercase tracking-widest mb-1 block">
                        Category
                      </label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value as NodeType)}
                        className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan/60"
                      >
                        {CATEGORY_OPTIONS.map((c) => (
                          <option key={c} value={c}>{nodeTypeConfig[c].label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="font-mono text-[10px] text-white/40 uppercase tracking-widest mb-1 block">
                        Station
                      </label>
                      <select
                        value={station}
                        onChange={(e) => setStation(e.target.value as StationId)}
                        className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan/60"
                      >
                        {STATIONS.map((s) => (
                          <option key={s} value={s}>{STATION_LABELS[s]}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-mono text-[10px] text-white/40 uppercase tracking-widest mb-1 block">
                        Subtype
                      </label>
                      <input
                        value={subtype}
                        onChange={(e) => setSubtype(e.target.value)}
                        placeholder="generator"
                        className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-cyan/60"
                      />
                    </div>
                    <div>
                      <label className="font-mono text-[10px] text-white/40 uppercase tracking-widest mb-1 block">
                        Zone
                      </label>
                      <input
                        value={zoneId}
                        onChange={(e) => setZoneId(e.target.value)}
                        placeholder="power-house"
                        className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-cyan/60"
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="flex items-start gap-2 text-xs text-crimson bg-crimson/10 border border-crimson/30 rounded p-2.5">
                      <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-1">
                    <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
                    <Button variant="primary" size="sm" loading={submitting} onClick={handleSubmit}>
                      Register Asset
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start gap-2 text-xs text-amber bg-amber/10 border border-amber/30 rounded p-2.5">
                    <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                    <span>
                      Paste these into the device manifest for this asset (Admin → Devices). They can also be viewed
                      again later from this asset&apos;s inspector panel.
                    </span>
                  </div>
                  <CopyField label="Asset ID" value={result.node_id} />
                  <CopyField label="API Key" value={result.api_key} />
                  <div className="flex justify-end pt-1">
                    <Button variant="secondary" size="sm" onClick={onClose}>Done</Button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
