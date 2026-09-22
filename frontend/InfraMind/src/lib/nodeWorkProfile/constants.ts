// src/lib/nodeWorkProfile/constants.ts
//
// Mongoose-free constants for NodeWorkProfile. Safe to import in both server
// (model) and client (badge rendering, action palette) contexts.

export const NODE_ACTION_CATEGORIES = ['diagnostic', 'maintenance', 'emergency'] as const
export type NodeActionCategory = (typeof NODE_ACTION_CATEGORIES)[number]
