// src/lib/models/ChatSession.ts
//
// One session per user × sessionType × contextKey. Shared by CAB Co-Pilot
// (sessionType 'cab') and the digital-twin MCP chat (sessionType 'mcp') so
// both use the same persistence layer without a model-per-feature split.
//
// contextKey encodes the optional simulation/architecture context:
//   'simulation_run:<id>' | 'architecture:<id>' | 'none'
// That makes upsert-by-context a simple three-field filter (no nullable
// sub-document index quirks).
//
// title: auto-set from the first message by the caller; never updated once
// set so session history stays associated with its original subject.

import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

export const CHAT_SESSION_TYPES = ['cab', 'mcp', 'general'] as const
export type ChatSessionType = (typeof CHAT_SESSION_TYPES)[number]

const ChatSessionSchema = new Schema(
  {
    clerkUserId: { type: String, required: true, index: true },
    userEmail: { type: String, required: true },
    sessionType: { type: String, enum: CHAT_SESSION_TYPES, required: true, index: true },
    contextKey: { type: String, required: true, default: 'none' },
    title: { type: String, default: null },
  },
  { timestamps: true },
)

// Unique session per user × type × context so resumption is a simple upsert.
ChatSessionSchema.index(
  { clerkUserId: 1, sessionType: 1, contextKey: 1 },
  { unique: true },
)

export type ChatSessionDoc = InferSchemaType<typeof ChatSessionSchema>

export const ChatSession =
  (models.ChatSession as Model<ChatSessionDoc>) ??
  model<ChatSessionDoc>('ChatSession', ChatSessionSchema)
