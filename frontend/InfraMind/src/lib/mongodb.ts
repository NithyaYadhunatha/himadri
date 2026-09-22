// src/lib/mongodb.ts
//
// Cached Mongoose connection singleton. Next.js dev hot-reload and the
// serverless/edge-adjacent execution model both re-invoke this module
// without restarting the process, so the connection (and in-flight connect
// promise) is stashed on `global` to avoid exhausting Mongo's connection pool.

import dns from 'dns'
import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI

interface MongooseCache {
  conn: typeof mongoose | null
  promise: Promise<typeof mongoose> | null
}

declare global {
  var _mongooseCache: MongooseCache | undefined
}

const cached: MongooseCache = global._mongooseCache ?? { conn: null, promise: null }
global._mongooseCache = cached

// `mongodb+srv://` resolves via a DNS SRV (and TXT) lookup before ever opening
// a socket to Mongo itself. On a machine where the OS's configured resolver
// is unreachable — observed here as Node's `dns.getServers()` reporting
// `127.0.0.1` with nothing actually answering on it (a VPN client or
// Internet Connection Sharing registering a loopback DNS entry that isn't
// live), that lookup fails with `ECONNREFUSED` before Mongo is ever
// contacted, surfacing as "querySrv ECONNREFUSED ..." — nothing to do with
// Mongo, credentials, or this app's code. Detected narrowly (this exact
// error shape) and retried once against public resolvers rather than
// unconditionally overriding `dns.setServers` for every environment: most
// deployments (including this app's own production) have a working
// resolver already, and there's no reason to bypass it there.
function isBrokenSrvResolverError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err as NodeJS.ErrnoException).code === 'ECONNREFUSED' &&
    /querySrv|queryTxt/.test(err.message)
  )
}

let fellBackToPublicDns = false

// Mongoose's own default (serverSelectionTimeoutMS: 30000) is well past every
// API route's client-side abort budget (e.g. graph.service.ts's 10s) — when
// Mongo is actually unreachable (down, not started, wrong URI), a request
// would hang for up to 30s before failing, and the client-side abort fires
// first with a generic, misleading "service did not respond" error that
// points at the wrong system (FastAPI, not Mongo). Failing fast here instead
// surfaces the real "Membership not active"/500 promptly, well inside every
// caller's own timeout.
const CONNECT_OPTIONS = { serverSelectionTimeoutMS: 5_000, connectTimeoutMS: 5_000 }

async function connectWithDnsFallback(uri: string): Promise<typeof mongoose> {
  try {
    return await mongoose.connect(uri, CONNECT_OPTIONS)
  } catch (err) {
    if (!fellBackToPublicDns && isBrokenSrvResolverError(err)) {
      fellBackToPublicDns = true
      dns.setServers(['1.1.1.1', '8.8.8.8'])
      return mongoose.connect(uri, CONNECT_OPTIONS)
    }
    throw err
  }
}

export async function dbConnect(): Promise<typeof mongoose> {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not set')
  }

  if (cached.conn) return cached.conn

  if (!cached.promise) {
    cached.promise = connectWithDnsFallback(MONGODB_URI).catch((err) => {
      // A failed connect attempt must not poison the cache — the next
      // dbConnect() call should retry rather than replay the same rejection
      // forever (mongoose.connect's own promise isn't retryable once settled).
      cached.promise = null
      throw err
    })
  }

  cached.conn = await cached.promise
  return cached.conn
}
