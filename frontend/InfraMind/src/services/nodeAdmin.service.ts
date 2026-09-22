// src/services/nodeAdmin.service.ts
//
// Asset lifecycle actions available from the browser — creating an asset
// record and re-viewing its api_key. Both go through the Next.js proxy
// (POST /api/assets, GET /api/nodes/{id}/credentials) so getCurrentMembership()
// station scoping applies, rather than calling FastAPI directly.
//
// A device (the physical data-collection agent) is registered separately via
// the Device Scalability admin page (POST /devices/manifest) — this service
// only creates the asset record itself, which a device manifest then attaches
// to via its asset_id.

import { USE_MOCK } from '@/lib/constants'

export interface CreateAssetInput {
  name: string
  station_id: string
  category: string
  subtype?: string
  zone_id?: string
  provenance?: string
}

export interface AssetCredentials {
  node_id: string
  api_key: string
  node_name: string
}

function mockId(prefix: string): string {
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}-${Date.now().toString(16)}`
}

export const nodeAdminService = {
  createNode: async (input: CreateAssetInput): Promise<AssetCredentials> => {
    if (USE_MOCK) {
      return Promise.resolve({ node_id: mockId('asset'), api_key: mockId('key'), node_name: input.name })
    }
    const res = await fetch('/api/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? `Failed to create asset (${res.status})`)
    }
    const created = await res.json() as { id: string; api_key?: string }
    return { node_id: created.id, api_key: created.api_key ?? '', node_name: input.name }
  },

  getCredentials: async (nodeId: string): Promise<AssetCredentials> => {
    if (USE_MOCK) {
      return Promise.resolve({ node_id: nodeId, api_key: mockId('key'), node_name: 'Mock Asset' })
    }
    const res = await fetch(`/api/nodes/${encodeURIComponent(nodeId)}/credentials`)
    if (!res.ok) throw new Error(`Failed to fetch credentials (${res.status})`)
    const data = await res.json() as { asset_id?: string; api_key: string }
    return { node_id: data.asset_id ?? nodeId, api_key: data.api_key, node_name: '' }
  },

  deleteNode: async (nodeId: string): Promise<void> => {
    if (USE_MOCK) return Promise.resolve()
    await fetch(`/api/nodes/${encodeURIComponent(nodeId)}`, { method: 'DELETE' }).then(async (res) => {
      if (res.ok) return
      const body = await res.json().catch(() => null) as { error?: string } | null
      throw new Error(body?.error ?? 'Failed to remove asset')
    })
  },
}
