// src/lib/models/User.ts
//
// Mirrors Clerk identity — one doc per clerkUserId. This is deliberately
// thin (no role/department here); access control lives entirely on Membership.

import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

const UserSchema = new Schema({
  clerkUserId: { type: String, required: true, unique: true, index: true },
  email: { type: String, required: true, index: true },
  name: { type: String, required: true, index: true },
  createdAt: { type: Date, default: () => new Date() },
})

export type UserDoc = InferSchemaType<typeof UserSchema>

export const User = (models.User as Model<UserDoc>) ?? model<UserDoc>('User', UserSchema)
