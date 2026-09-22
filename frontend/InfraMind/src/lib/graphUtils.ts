// src/lib/graphUtils.ts
// Shared helper for deriving a node's dependency lists from an edge array,
// so dependencyCount/dependencies/dependents stay consistent between the
// mock topology and the live graph adapter.

interface EdgeLike {
  source: string
  target: string
}

export function computeDependencyLists<E extends EdgeLike>(
  nodeId: string,
  edges: E[]
): { dependencies: string[]; dependents: string[] } {
  const dependencies = edges.filter((e) => e.source === nodeId).map((e) => e.target)
  const dependents = edges.filter((e) => e.target === nodeId).map((e) => e.source)
  return { dependencies, dependents }
}
