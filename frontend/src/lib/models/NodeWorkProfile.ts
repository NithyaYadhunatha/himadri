// src/lib/models/NodeWorkProfile.ts
//
// Per-node customization of the default action palette defined in nodeTypes.ts.
//
// nodeKey matches GraphNode.id / NodeBusinessMeta.nodeKey — one record per
// physical node, looked up the same way from both sides.
//
// enabledActionIds: the subset of the node type's default action IDs that this
// particular node exposes. Empty array means "show all type defaults" — i.e. no
// profile set is identical to an empty filter. Non-empty means "show only
// these IDs from the type defaults plus any customActions".
//
// customActions: operator-defined actions that are not in the type palette at
// all — e.g. a Waters Chromatograph node with instrument-specific lab commands.
// Stored inline as plain subdocuments; the id field should use the same
// dot-notation convention (e.g. 'chromatograph.lab.run_batch') so Phase 8
// Task 3's ActivityLog entries are consistently keyed.

import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'
import { NODE_ACTION_CATEGORIES } from '@/lib/nodeWorkProfile/constants'

export { NODE_ACTION_CATEGORIES }
export type { NodeActionCategory } from '@/lib/nodeWorkProfile/constants'

const CustomActionSchema = new Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    description: { type: String, default: '' },
    category: { type: String, enum: NODE_ACTION_CATEGORIES, required: true },
    requiresConfirmation: { type: Boolean, default: false },
  },
  { _id: false },
)

const NodeWorkProfileSchema = new Schema(
  {
    nodeKey: { type: String, required: true, unique: true, index: true },
    enabledActionIds: { type: [String], default: [] },
    customActions: { type: [CustomActionSchema], default: [] },
  },
  { timestamps: true },
)

export type NodeWorkProfileDoc = InferSchemaType<typeof NodeWorkProfileSchema>

export const NodeWorkProfile =
  (models.NodeWorkProfile as Model<NodeWorkProfileDoc>) ??
  model<NodeWorkProfileDoc>('NodeWorkProfile', NodeWorkProfileSchema)
