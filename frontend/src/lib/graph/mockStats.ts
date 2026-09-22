// src/lib/graph/mockStats.ts
//
// Deterministic per-node "extra" stats for the type-specific panels
// (§5 of the task) where the backend has no equivalent field yet — see
// DEVELOPMENT_STATUS.md for exactly which fields are real vs stubbed here.
// Seeded by node id so numbers stay stable across re-renders/refreshes
// instead of jumping around on every click, without needing real backend data.

function seededRandom(seed: string): () => number {
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = (h << 5) - h + seed.charCodeAt(i)
    h |= 0
  }
  return () => {
    h = (h * 1103515245 + 12345) & 0x7fffffff
    return h / 0x7fffffff
  }
}

export function mockStatsFor(nodeId: string) {
  const rand = seededRandom(nodeId)
  const pick = (min: number, max: number) => Math.round(min + rand() * (max - min))
  return { rand, pick }
}
