// src/components/nodes/CreateCustomNodeModal.tsx
//
// "Create Custom Asset" — upload a PRD (.txt/.md/.json/.docx/.pdf), OpenAI
// extracts a short summary from it, then a real 'custom' category asset is
// created via nodeAdminService.createNode (POST /api/assets). The PRD
// summary is shown as a one-time receipt only — there is no backend field to
// persist free-text asset notes (see this component's handleSubmit comment).
'use client'

import { useEffect, useState, useRef } from 'react'
import { FileUp, AlertTriangle, CircleCheck } from 'lucide-react'
import { CenteredModal } from '@/components/ui/CenteredModal'
import { Button } from '@/components/ui/Button'
import { nodeAdminService } from '@/services/nodeAdmin.service'
import { STATIONS, STATION_LABELS, type StationId } from '@/lib/constants'

interface CreateCustomNodeModalProps {
  open: boolean
  onClose: () => void
  onCreated?: () => void
}

type Step = 'form' | 'analyzing' | 'creating' | 'done'

const inputClass =
  'w-full bg-brand-bg border border-brand-border rounded px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-cyan/60'
const labelClass = 'font-mono text-[10px] text-white/40 uppercase tracking-widest mb-1 block'

export function CreateCustomNodeModal({ open, onClose, onCreated }: CreateCustomNodeModalProps) {
  const [nodeName, setNodeName] = useState('')
  const [station, setStation] = useState<StationId>(STATIONS[0])
  const [zoneId, setZoneId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [step, setStep] = useState<Step>('form')
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // setState calls deferred into a microtask, never the synchronous effect
  // body, to satisfy the react-hooks/set-state-in-effect lint rule.
  useEffect(() => {
    if (!open) return
    Promise.resolve().then(() => {
      setNodeName('')
      setStation(STATIONS[0])
      setZoneId('')
      setFile(null)
      setStep('form')
      setError(null)
      setSummary(null)
      setCreatedId(null)
    })
  }, [open])

  const handleSubmit = async () => {
    if (!nodeName.trim()) {
      setError('Asset name is required.')
      return
    }
    if (!file) {
      setError('Upload a PRD document (.txt, .md, .json, .docx, or .pdf).')
      return
    }
    setError(null)

    try {
      setStep('analyzing')
      const formData = new FormData()
      formData.append('nodeName', nodeName.trim())
      formData.append('file', file)
      const analyzeRes = await fetch('/api/custom-nodes/analyze-prd', {
        method: 'POST',
        body: formData,
      })
      const analysis = await analyzeRes.json().catch(() => ({}))
      if (!analyzeRes.ok) {
        throw new Error(analysis?.error ?? 'PRD analysis failed')
      }

      setStep('creating')
      const created = await nodeAdminService.createNode({
        name: nodeName.trim(),
        station_id: station,
        category: 'custom',
        zone_id: zoneId.trim() || undefined,
      })

      const description = [
        `Category: ${analysis.category}`,
        '',
        analysis.summary,
        '',
        'Key Requirements:',
        ...(analysis.keyRequirements ?? []).map((r: string) => `- ${r}`),
      ].join('\n')

      // The PRD summary is shown as a one-time receipt below — there is no
      // backend field to persist free-text asset notes yet (NodeBusinessMeta,
      // which used to hold this, was removed along with revenue/SLA business
      // metadata; see lib/backendAdapters.ts's header comment), so it isn't
      // saved onto the asset itself.
      setCreatedId(created.node_id)
      setSummary(description)
      setStep('done')
      onCreated?.()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create custom asset'
      setError(message)
      setStep('form')
    }
  }

  const busy = step === 'analyzing' || step === 'creating'

  return (
    <CenteredModal
      open={open}
      onClose={onClose}
      title={step === 'done' ? 'Custom Asset Created' : 'Create Custom Asset'}
      subtitle={step === 'done' ? undefined : 'Upload a PRD — OpenAI extracts a summary and the asset is created'}
      width="w-full max-w-[520px]"
    >
      <div className="p-4 space-y-4">
        {step !== 'done' ? (
          <>
            <div>
              <label className={labelClass}>Asset Name</label>
              <input
                value={nodeName}
                onChange={(e) => setNodeName(e.target.value)}
                placeholder="e.g. Edge Sensor Gateway"
                disabled={busy}
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Station</label>
                <select
                  value={station}
                  onChange={(e) => setStation(e.target.value as StationId)}
                  disabled={busy}
                  className={inputClass}
                >
                  {STATIONS.map((s) => (
                    <option key={s} value={s}>{STATION_LABELS[s]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Zone</label>
                <input
                  value={zoneId}
                  onChange={(e) => setZoneId(e.target.value)}
                  placeholder="main-building"
                  disabled={busy}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>PRD Document (.txt, .md, .json, .docx, .pdf)</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.json,.docx,.pdf,text/plain,text/markdown,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={busy}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className="w-full flex items-center gap-2 border border-dashed border-brand-border rounded px-3 py-2.5 text-sm text-white/60 hover:text-white hover:border-cyan/40 transition-colors disabled:opacity-50"
              >
                <FileUp size={14} className="shrink-0" />
                {file ? file.name : 'Choose a file…'}
              </button>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-xs text-crimson bg-crimson/10 border border-crimson/30 rounded p-2.5">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button variant="primary" size="sm" loading={busy} onClick={handleSubmit}>
                {step === 'analyzing' ? 'Analyzing PRD…' : step === 'creating' ? 'Creating Asset…' : 'Create'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start gap-2 text-xs text-emerald bg-emerald/10 border border-emerald/30 rounded p-2.5">
              <CircleCheck size={13} className="shrink-0 mt-0.5" />
              <span>&quot;{nodeName}&quot; was created and added to the station twin{createdId ? ` (id: ${createdId})` : ''}.</span>
            </div>
            <div>
              <label className={labelClass}>PRD Summary</label>
              <p className="text-xs text-white/70 leading-relaxed whitespace-pre-line bg-brand-bg border border-brand-border rounded p-3">
                {summary}
              </p>
            </div>
            <div className="flex justify-end pt-1">
              <Button variant="secondary" size="sm" onClick={onClose}>Done</Button>
            </div>
          </>
        )}
      </div>
    </CenteredModal>
  )
}
