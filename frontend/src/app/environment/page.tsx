'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Telescope, Recycle, FileText, Check, X as XIcon, Thermometer,
  Sun, Cloud, CloudFog, CloudRain, CloudSnow, CloudLightning,
  Wind, Droplets, Gauge, Navigation, RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Sparkline } from '@/components/ui/Sparkline'
import { ErrorState, InlineLoader, EmptyState } from '@/components/ui/Loader'
import { environmentService, type WasteRecord, type Advisory, type ReportSummary, type StationWeather } from '@/services/environment.service'
import { nodeHealthService } from '@/services/nodeHealth.service'
import { useStationStore } from '@/store/useStationStore'
import type { NodeHealth } from '@/types/nodes'

const WEATHER_POLL_MS = 5 * 60_000

function weatherIcon(code: number) {
  if (code === 0 || code === 1) return Sun
  if (code === 2 || code === 3) return Cloud
  if (code === 45 || code === 48) return CloudFog
  if (code >= 51 && code <= 67) return CloudRain
  if (code >= 71 && code <= 86) return CloudSnow
  if (code >= 95) return CloudLightning
  return Cloud
}

function compass(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  return dirs[Math.round(deg / 22.5) % 16]
}

function StatTile({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded border border-brand-border bg-brand-bg px-3 py-2.5">
      <Icon size={15} className="text-cyan shrink-0" />
      <div className="min-w-0">
        <p className="font-mono text-[9px] text-white/40 uppercase tracking-widest">{label}</p>
        <p className="font-mono text-sm text-white leading-tight">{value}{sub && <span className="text-white/40 text-xs ml-1">{sub}</span>}</p>
      </div>
    </div>
  )
}

export default function EnvironmentPage() {
  const station = useStationStore((s) => s.station)
  const [instruments, setInstruments] = useState<NodeHealth[]>([])
  const [waste, setWaste] = useState<WasteRecord[]>([])
  const [advisories, setAdvisories] = useState<Advisory[]>([])
  const [reports, setReports] = useState<ReportSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [advisoryBusy, setAdvisoryBusy] = useState<string | null>(null)

  const [weather, setWeather] = useState<StationWeather | null>(null)
  const [weatherError, setWeatherError] = useState<string | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [nodes, wasteRes, advRes, repRes] = await Promise.allSettled([
        nodeHealthService.getNodes({ type: ['instrument'] }),
        environmentService.getWaste(station),
        environmentService.getAdvisories(station),
        environmentService.getReports(station),
      ])
      setInstruments(nodes.status === 'fulfilled' ? nodes.value.filter((n) => !n.stationId || n.stationId === station) : [])
      setWaste(wasteRes.status === 'fulfilled' ? wasteRes.value : [])
      setAdvisories(advRes.status === 'fulfilled' ? advRes.value : [])
      setReports(repRes.status === 'fulfilled' ? repRes.value : [])
    } finally {
      setLoading(false)
    }
  }, [station])

  const loadWeather = useCallback(async (showLoader = false) => {
    if (showLoader) setWeatherLoading(true)
    try {
      const w = await environmentService.getCurrentConditions(station)
      setWeather(w)
      setWeatherError(null)
    } catch (err) {
      setWeatherError(err instanceof Error ? err.message : 'Failed to fetch live conditions')
    } finally {
      if (showLoader) setWeatherLoading(false)
    }
  }, [station])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadWeather(true) }, [loadWeather])
  useEffect(() => {
    const id = setInterval(() => loadWeather(false), WEATHER_POLL_MS)
    return () => clearInterval(id)
  }, [loadWeather])

  const aws = instruments.find((i) => i.name.toLowerCase().includes('weather') || i.name.toLowerCase().includes('aws'))

  const handleGenerateReport = async () => {
    setGenerating(true)
    setError(null)
    try {
      await environmentService.generateReport(station, 'environmental')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report')
    } finally {
      setGenerating(false)
    }
  }

  const handleAdvisory = async (id: string, action: 'accept' | 'reject') => {
    setAdvisoryBusy(id)
    try {
      if (action === 'accept') await environmentService.acceptAdvisory(id)
      else await environmentService.rejectAdvisory(id)
      await load()
    } finally {
      setAdvisoryBusy(null)
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-brand-bg p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="font-mono text-sm font-bold text-white uppercase tracking-widest">
            Environmental Monitoring — {station.toUpperCase()}
          </h1>
          <p className="text-white/40 text-xs mt-1 font-sans">Live regional conditions, science-instrument health, waste/carbon reporting, and advisories.</p>
        </div>

        {loading && <div className="flex justify-center py-16"><InlineLoader text="Loading environmental data…" /></div>}
        {error && <ErrorState message={error} onRetry={load} />}

        {!loading && (
          <>
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-mono text-xs text-white/50 uppercase tracking-widest flex items-center gap-1.5">
                  {(() => { const Icon = weatherIcon(weather?.weatherCode ?? 0); return <Icon size={13} /> })()} Live Conditions — Around the Station
                </h2>
                <div className="flex items-center gap-2">
                  {weather && !weatherLoading && (
                    <span className="font-mono text-[9px] text-white/30">
                      {new Date(weather.observedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC · {weather.source}
                    </span>
                  )}
                  <Button variant="ghost" size="sm" icon={<RefreshCw size={11} />} onClick={() => loadWeather(true)} loading={weatherLoading}>
                    Refresh
                  </Button>
                </div>
              </div>

              {weatherLoading ? (
                <div className="flex items-center justify-center py-10 bg-brand-surface border border-brand-border rounded"><InlineLoader text="Fetching live conditions…" /></div>
              ) : weatherError ? (
                <ErrorState message={weatherError} onRetry={() => loadWeather(true)} />
              ) : weather ? (
                <div className="bg-brand-surface border border-brand-border rounded p-4">
                  <div className="flex items-center gap-4 mb-4">
                    {(() => { const Icon = weatherIcon(weather.weatherCode); return <Icon size={34} className="text-cyan shrink-0" /> })()}
                    <div>
                      <p className="font-mono text-3xl text-white leading-none">{Math.round(weather.temperatureC)}°C</p>
                      <p className="text-xs font-sans text-white/50 mt-1">{weather.weatherLabel} · feels like {Math.round(weather.feelsLikeC)}°C</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                    <StatTile icon={Wind} label="Wind" value={`${Math.round(weather.windSpeedKmh)}`} sub="km/h" />
                    <StatTile icon={Navigation} label="Direction" value={compass(weather.windDirectionDeg)} sub={`${Math.round(weather.windDirectionDeg)}°`} />
                    <StatTile icon={Wind} label="Gusts" value={`${Math.round(weather.windGustKmh)}`} sub="km/h" />
                    <StatTile icon={Droplets} label="Humidity" value={`${Math.round(weather.humidityPct)}%`} />
                    <StatTile icon={Gauge} label="Pressure" value={`${Math.round(weather.pressureHpa)}`} sub="hPa" />
                  </div>
                  <p className="font-mono text-[9px] text-white/25 mt-3">
                    {weather.latitude.toFixed(2)}°S, {weather.longitude.toFixed(2)}°E · auto-refreshes every {WEATHER_POLL_MS / 60_000} min
                  </p>
                </div>
              ) : null}
            </section>

            {aws && (
              <section>
                <h2 className="font-mono text-xs text-white/50 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <Thermometer size={13} /> AWS Instrument Health — {aws.name}
                </h2>
                <div className="bg-brand-surface border border-brand-border rounded p-4">
                  <Sparkline data={aws.trend} color="#3A3AB8" height={60} />
                  <p className="font-mono text-[10px] text-white/30 mt-2">Health score {aws.healthScore} · {aws.health}</p>
                </div>
              </section>
            )}

            <section>
              <h2 className="font-mono text-xs text-white/50 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Telescope size={13} /> Science Instrument Health
              </h2>
              {instruments.length === 0 ? (
                <EmptyState message="No science instruments registered for this station" />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {instruments.map((i) => (
                    <div key={i.id} className="bg-brand-surface border border-brand-border rounded p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-sans text-white truncate">{i.name}</span>
                        <Badge variant={i.health === 'healthy' ? 'healthy' : i.health === 'degraded' ? 'warning' : 'critical'} size="sm">{i.health}</Badge>
                      </div>
                      <p className="font-mono text-[10px] text-white/40">Health {i.healthScore}</p>
                      {i.alerts.length > 0 && (
                        <p className="text-[10px] font-mono text-amber mt-1">{i.alerts.length} alert(s)</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="font-mono text-xs text-white/50 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Recycle size={13} /> Waste &amp; Carbon
              </h2>
              {waste.length === 0 ? (
                <EmptyState message="No waste records" />
              ) : (
                <div className="bg-brand-surface border border-brand-border rounded overflow-hidden mb-3">
                  <table className="w-full text-xs">
                    <thead className="bg-brand-bg text-white/40 font-mono uppercase text-[10px]">
                      <tr><th className="text-left px-3 py-2">Category</th><th className="text-right px-3 py-2">Quantity (kg)</th><th className="text-left px-3 py-2">Method</th><th className="text-left px-3 py-2">Recorded</th></tr>
                    </thead>
                    <tbody>
                      {waste.map((w) => (
                        <tr key={w.id} className="border-t border-brand-border">
                          <td className="px-3 py-2 text-white/80 font-mono">{w.category}</td>
                          <td className="px-3 py-2 text-right font-mono text-white/70">{w.quantity_kg}</td>
                          <td className="px-3 py-2 text-white/50">{w.method}</td>
                          <td className="px-3 py-2 text-white/30 font-mono">{new Date(w.recorded_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex items-center gap-3">
                <Button variant="secondary" size="sm" icon={<FileText size={13} />} loading={generating} onClick={handleGenerateReport}>
                  Generate Environmental Report
                </Button>
                {reports.length > 0 && (
                  <span className="font-mono text-[10px] text-white/30">{reports.length} report(s) on file</span>
                )}
              </div>
            </section>

            <section>
              <h2 className="font-mono text-xs text-white/50 uppercase tracking-widest mb-3">Advisories</h2>
              {advisories.length === 0 ? (
                <EmptyState message="No pending advisories" />
              ) : (
                <div className="space-y-2">
                  {advisories.map((a) => (
                    <div key={a.id} className="bg-brand-surface border border-brand-border rounded p-3 flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={a.status === 'accepted' ? 'healthy' : a.status === 'rejected' ? 'critical' : 'warning'} size="sm">{a.status}</Badge>
                          <span className="font-mono text-[10px] text-white/40 uppercase">{a.kind}</span>
                        </div>
                        <p className="text-xs font-sans text-white/80">{a.message}</p>
                      </div>
                      {a.status === 'pending' && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button onClick={() => handleAdvisory(a.id, 'accept')} disabled={advisoryBusy === a.id} className="p-1.5 rounded border border-emerald/30 text-emerald hover:bg-emerald/10 transition-colors disabled:opacity-40">
                            <Check size={13} />
                          </button>
                          <button onClick={() => handleAdvisory(a.id, 'reject')} disabled={advisoryBusy === a.id} className="p-1.5 rounded border border-crimson/30 text-crimson hover:bg-crimson/10 transition-colors disabled:opacity-40">
                            <XIcon size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
