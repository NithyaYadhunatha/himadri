// src/lib/models/ChatMessage.ts
//
// One row per chat turn. sessionId links to ChatSession; messages are
// retrieved ordered by createdAt ascending to reconstruct the conversation.
//
// role: 'user' for human turns, 'assistant' for LLM replies — matches the
// OpenAI/Anthropic convention so history can be passed back to LLMs without
// remapping. The CAB page stores 'user'/'ai' in local state; the service
// layer maps between the two when reading/writing.

import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

const ChatMessageSchema = new Schema(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: 'ChatSession',
      required: true,
      index: true,
    },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
  },
  { timestamps: true },
)

export type ChatMessageDoc = InferSchemaType<typeof ChatMessageSchema>

export const ChatMessage =
  (models.ChatMessage as Model<ChatMessageDoc>) ??
  model<ChatMessageDoc>('ChatMessage', ChatMessageSchema)
