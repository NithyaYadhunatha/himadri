// src/lib/models/UserPreferences.ts
//
// Per-user view settings for the Digital Twin canvas. Persisted in Mongo so
// preferences survive page refreshes and cross-session. All values have safe
// defaults so a missing doc is always recoverable without a write.
//
// Exported const arrays are mongoose-free so client components can import them
// without pulling the driver into the browser bundle.

import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

export const LAYOUT_PRESETS = ['TB', 'LR', 'circular'] as const
export type LayoutPreset = (typeof LAYOUT_PRESETS)[number]

export const NODE_SIZE_MODES = ['compact', 'normal', 'expanded'] as const
export type NodeSizeMode = (typeof NODE_SIZE_MODES)[number]

export const COLOR_MODES = ['health', 'type'] as const
export type ColorMode = (typeof COLOR_MODES)[number]

const UserPreferencesSchema = new Schema(
  {
    clerkUserId: { type: String, required: true, unique: true, index: true },
    layoutPreset: { type: String, enum: LAYOUT_PRESETS, default: 'TB' },
    nodeSizeMode: { type: String, enum: NODE_SIZE_MODES, default: 'normal' },
    colorMode: { type: String, enum: COLOR_MODES, default: 'type' },
    showEdgeLabels: { type: Boolean, default: false },
    showLegend: { type: Boolean, default: false },
  },
  { timestamps: true }
)

export type UserPreferencesDoc = InferSchemaType<typeof UserPreferencesSchema>

export const UserPreferences =
  (models.UserPreferences as Model<UserPreferencesDoc>) ??
  model<UserPreferencesDoc>('UserPreferences', UserPreferencesSchema)
