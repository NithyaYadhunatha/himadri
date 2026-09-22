// src/lib/graph/workProfile.ts
//
// Client-safe helper — no mongoose import. Merges a node's type-default action
// palette (from nodeTypeConfig) with any per-node overrides stored in a
// NodeWorkProfile document.
//
// Result is the effective action list the UI should display and execute against.

import { nodeTypeConfig, type NodeAction } from '@/lib/graph/nodeTypes'
import type { NodeType } from '@/types/graph'
import type { NodeActionCategory } from '@/lib/nodeWorkProfile/constants'

export interface WorkProfileLean {
  enabledActionIds: string[]
  customActions: {
    id: string
    label: string
    description: string
    category: NodeActionCategory
    requiresConfirmation?: boolean
  }[]
}

/**
 * Returns the effective action list for a node instance.
 *
 * - If `profile` is null or `enabledActionIds` is empty, all type-default
 *   actions are included (plus any custom actions from the profile).
 * - If `enabledActionIds` is non-empty, only those IDs are kept from the
 *   type defaults; the rest are hidden.
 * - `customActions` from the profile are always appended after the defaults.
 */
export function getEffectiveActions(
  nodeType: NodeType,
  profile: WorkProfileLean | null,
): NodeAction[] {
  const typeDefaults: NodeAction[] = nodeTypeConfig[nodeType]?.actions ?? []

  const filtered =
    !profile || profile.enabledActionIds.length === 0
      ? typeDefaults
      : typeDefaults.filter((a) => profile.enabledActionIds.includes(a.id))

  const custom: NodeAction[] = (profile?.customActions ?? []).map((c) => ({
    id: c.id,
    label: c.label,
    description: c.description,
    category: c.category,
    requiresConfirmation: c.requiresConfirmation,
  }))

  return [...filtered, ...custom]
}
