'use client'

import { useState, useEffect, useCallback } from 'react'
import { Cpu, Check, Plus, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ErrorState, InlineLoader, EmptyState } from '@/components/ui/Loader'
import { devicesService, type DeviceRecord, type DeviceSeries } from '@/services/devices.service'

function emptySeries(): DeviceSeries {
  return { name: '', unit: '', kind: 'gauge', critical: false, stale_after_seconds: 3600, default_rules: [] }
}

export default function AdminDevicesPage() {
  const [pending, setPending] = useState<DeviceRecord[]>([])
  const [all, setAll] = useState<DeviceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [approvingId, setApprovingId] = useState<string | null>(null)

  const [deviceId, setDeviceId] = useState('')
  const [assetId, setAssetId] = useState('')
  const [vendor, setVendor] = useState('')
  const [series, setSeries] = useState<DeviceSeries[]>([emptySeries()])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [pendingList, allList] = await Promise.allSettled([
        devicesService.listPending(),
        devicesService.list(),
      ])
      setPending(pendingList.status === 'fulfilled' ? pendingList.value : [])
      setAll(allList.status === 'fulfilled' ? allList.value : [])
      if (pendingList.status === 'rejected' && allList.status === 'rejected') {
        setError('Device backend unavailable')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleApprove = async (id: string) => {
    setApprovingId(id)
    try {
      await devicesService.approve(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve device')
    } finally {
      setApprovingId(null)
    }
  }

  const updateSeries = (index: number, patch: Partial<DeviceSeries>) => {
    setSeries((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  const handleRegister = async () => {
    setSubmitError(null)
    if (!deviceId.trim() || !assetId.trim() || !vendor.trim()) {
      setSubmitError('Device ID, Asset ID, and vendor are required.')
      return
    }
    setSubmitting(true)
    setSubmitSuccess(false)
    try {
      await devicesService.registerManifest({
        device_id: deviceId.trim(),
        asset_id: assetId.trim(),
        vendor: vendor.trim(),
        series: series.filter((s) => s.name.trim()),
      })
      setSubmitSuccess(true)
      setDeviceId('')
      setAssetId('')
      setVendor('')
      setSeries([emptySeries()])
      await load()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to register device manifest')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-brand-bg p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="font-mono text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
            <Cpu size={16} className="text-cyan" />
            Device Scalability
          </h1>
          <p className="text-white/62 text-xs mt-1 font-sans">Approve pending devices and register new device manifests.</p>
        </div>

        {loading && <div className="flex justify-center py-16"><InlineLoader text="Loading devices…" /></div>}
        {error && <ErrorState message={error} onRetry={load} />}

        {!loading && (
          <>
            <section>
              <h2 className="font-mono text-xs text-white/70 uppercase tracking-widest mb-3">Pending Approval ({pending.length})</h2>
              {pending.length === 0 ? (
                <EmptyState message="No devices awaiting approval" />
              ) : (
                <div className="space-y-2">
                  {pending.map((d) => (
                    <div key={d.id} className="bg-brand-surface border border-brand-border rounded p-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-sans text-white">{d.device_id}</p>
                        <p className="font-mono text-[10px] text-white/62">{d.vendor} · asset {d.asset_id}</p>
                      </div>
                      <Button variant="primary" size="sm" icon={<Check size={13} />} loading={approvingId === d.id} onClick={() => handleApprove(d.id)}>
                        Approve
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="font-mono text-xs text-white/70 uppercase tracking-widest mb-3">All Devices ({all.length})</h2>
              {all.length === 0 ? (
                <EmptyState message="No devices registered yet" />
              ) : (
                <div className="bg-brand-surface border border-brand-border rounded overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-brand-bg text-white/62 font-mono uppercase text-[10px]">
                      <tr><th className="text-left px-3 py-2">Device ID</th><th className="text-left px-3 py-2">Asset</th><th className="text-left px-3 py-2">Vendor</th><th className="text-left px-3 py-2">Status</th></tr>
                    </thead>
                    <tbody>
                      {all.map((d) => (
                        <tr key={d.id} className="border-t border-brand-border">
                          <td className="px-3 py-2 text-white/80 font-mono">{d.device_id}</td>
                          <td className="px-3 py-2 text-white/70 font-mono">{d.asset_id}</td>
                          <td className="px-3 py-2 text-white/70">{d.vendor}</td>
                          <td className="px-3 py-2">
                            <Badge variant={d.status === 'approved' ? 'healthy' : d.status === 'rejected' ? 'critical' : 'warning'} size="sm">{d.status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section>
              <h2 className="font-mono text-xs text-white/70 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Upload size={13} /> Register Device Manifest
              </h2>
              <div className="bg-brand-surface border border-brand-border rounded p-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="font-mono text-[10px] text-white/62 uppercase tracking-widest block mb-1">Device ID</label>
                    <input value={deviceId} onChange={(e) => setDeviceId(e.target.value)} placeholder="dev-001" className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:border-cyan/60" />
                  </div>
                  <div>
                    <label className="font-mono text-[10px] text-white/62 uppercase tracking-widest block mb-1">Asset ID</label>
                    <input value={assetId} onChange={(e) => setAssetId(e.target.value)} placeholder="maitri-genset-1" className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:border-cyan/60" />
                  </div>
                  <div>
                    <label className="font-mono text-[10px] text-white/62 uppercase tracking-widest block mb-1">Vendor</label>
                    <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Cummins" className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:border-cyan/60" />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="font-mono text-[10px] text-white/62 uppercase tracking-widest">Telemetry Series</label>
                    <button onClick={() => setSeries((prev) => [...prev, emptySeries()])} className="text-[10px] font-mono text-cyan hover:underline flex items-center gap-1">
                      <Plus size={11} /> Add series
                    </button>
                  </div>
                  <div className="space-y-2">
                    {series.map((s, i) => (
                      <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_80px_100px_80px_auto] gap-2 items-center bg-brand-bg border border-brand-border rounded p-2">
                        <input value={s.name} onChange={(e) => updateSeries(i, { name: e.target.value })} placeholder="output_kw" className="bg-brand-surface border border-brand-border rounded px-2 py-1.5 text-xs text-white placeholder:text-white/50 focus:outline-none focus:border-cyan/50" />
                        <input value={s.unit} onChange={(e) => updateSeries(i, { unit: e.target.value })} placeholder="kW" className="bg-brand-surface border border-brand-border rounded px-2 py-1.5 text-xs text-white placeholder:text-white/50 focus:outline-none focus:border-cyan/50" />
                        <select value={s.kind} onChange={(e) => updateSeries(i, { kind: e.target.value })} className="bg-brand-surface border border-brand-border rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-cyan/50">
                          <option value="gauge">gauge</option>
                          <option value="counter">counter</option>
                          <option value="state">state</option>
                        </select>
                        <label className="flex items-center gap-1.5 text-[10px] font-mono text-white/70">
                          <input type="checkbox" checked={s.critical} onChange={(e) => updateSeries(i, { critical: e.target.checked })} className="accent-cyan" /> critical
                        </label>
                        <button onClick={() => setSeries((prev) => prev.filter((_, j) => j !== i))} className="text-crimson hover:text-crimson/80 justify-self-end">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {submitError && <p className="text-xs font-mono text-crimson">{submitError}</p>}
                {submitSuccess && <p className="text-xs font-mono text-emerald">Device manifest registered.</p>}

                <Button variant="primary" size="sm" icon={<Upload size={13} />} loading={submitting} onClick={handleRegister}>
                  Register Manifest
                </Button>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
