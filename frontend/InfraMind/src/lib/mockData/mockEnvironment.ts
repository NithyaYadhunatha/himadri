// src/lib/mockData/mockEnvironment.ts
//
// Frontend-only fallback for the Environmental Monitoring page (waste,
// advisories, generated reports), gated by NEXT_PUBLIC_USE_MOCK.
import type { WasteRecord, Advisory, ReportSummary } from '@/services/environment.service'

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 3600_000).toISOString()

export const mockWaste: Record<string, WasteRecord[]> = {
  maitri: [
    { id: 'maitri-waste-001', station_id: 'maitri', category: 'paper', quantity_kg: 12.5, method: 'compacted', recorded_at: daysAgo(1) },
    { id: 'maitri-waste-002', station_id: 'maitri', category: 'plastic', quantity_kg: 8.2, method: 'stored', recorded_at: daysAgo(1) },
    { id: 'maitri-waste-003', station_id: 'maitri', category: 'metal', quantity_kg: 22.0, method: 'stored', recorded_at: daysAgo(3) },
    { id: 'maitri-waste-004', station_id: 'maitri', category: 'food', quantity_kg: 6.4, method: 'stored', recorded_at: daysAgo(0) },
    { id: 'maitri-waste-005', station_id: 'maitri', category: 'hazardous', quantity_kg: 1.8, method: 'backloaded', recorded_at: daysAgo(20) },
  ],
  bharati: [
    { id: 'bharati-waste-001', station_id: 'bharati', category: 'paper', quantity_kg: 9.1, method: 'compacted', recorded_at: daysAgo(2) },
    { id: 'bharati-waste-002', station_id: 'bharati', category: 'glass', quantity_kg: 4.6, method: 'stored', recorded_at: daysAgo(4) },
    { id: 'bharati-waste-003', station_id: 'bharati', category: 'food', quantity_kg: 5.9, method: 'stored', recorded_at: daysAgo(0) },
  ],
}

export const mockAdvisories: Record<string, Advisory[]> = {
  maitri: [
    { id: 'maitri-advisory-001', station_id: 'maitri', kind: 'energy_saving', message: 'Shift laundry load to off-peak generator hours (22:00-05:00) to save an estimated 180 L fuel/week.', status: 'pending', created_at: daysAgo(1) },
    { id: 'maitri-advisory-002', station_id: 'maitri', kind: 'energy_saving', message: 'Generator 2 load factor trending high — stage Generator 3 as parallel standby before next storm window.', status: 'pending', created_at: daysAgo(2) },
    { id: 'maitri-advisory-003', station_id: 'maitri', kind: 'weather', message: 'Reduce non-essential outdoor vehicle movement — katabatic wind advisory for the next 48h.', status: 'accepted', created_at: daysAgo(5) },
  ],
  bharati: [
    { id: 'bharati-advisory-001', station_id: 'bharati', kind: 'energy_saving', message: 'AHU filter differential pressure trending up — schedule replacement before it forces higher fan load.', status: 'pending', created_at: daysAgo(1) },
    { id: 'bharati-advisory-002', station_id: 'bharati', kind: 'weather', message: 'Sea-ice conditions favorable for a supply run this week — recommend scheduling before the next system.', status: 'pending', created_at: daysAgo(3) },
  ],
}

export const mockReports: Record<string, ReportSummary[]> = {
  maitri: [
    { id: 'maitri-report-001', station_id: 'maitri', report_type: 'environmental', generated_at: daysAgo(7), url: null },
    { id: 'maitri-report-002', station_id: 'maitri', report_type: 'health', generated_at: daysAgo(1), url: null },
  ],
  bharati: [
    { id: 'bharati-report-001', station_id: 'bharati', report_type: 'environmental', generated_at: daysAgo(6), url: null },
  ],
}
