// src/lib/mockData/mockAudit.ts
//
// Frontend-only fallback for the /audit page, gated by NEXT_PUBLIC_USE_MOCK.
// A short privileged-action log with a real, self-consistent SHA-256 hash
// chain — same algorithm as the backend's audit_engine.py
// (hash = sha256(prev_hash + canonicalJSON(row)), genesis = 64 zeros) — so
// mockVerifyChain() below can genuinely walk and verify it rather than
// returning a hardcoded "valid: true".
import type { AuditEntry, AuditVerifyResult } from '@/services/audit.service'

const GENESIS_HASH = '0'.repeat(64)
const hoursAgo = (n: number) => new Date(Date.now() - n * 3600_000).toISOString()

// Rows as recorded (everything but seq/created_at/hash — those are derived
// below so the chain stays consistent if this list is ever edited).
const ROWS: Array<Omit<AuditEntry, 'seq' | 'created_at' | 'hash'>> = [
  { actor: 'dev@himadri.local', action: 'alert.ack', target: 'alert-maitri-002', station_id: 'maitri', metadata: { note: 'Staging Generator 3 as standby' } },
  { actor: 'dev@himadri.local', action: 'advisory.accept', target: 'maitri-advisory-003', station_id: 'maitri', metadata: null },
  { actor: 'dev@himadri.local', action: 'inventory.count', target: 'maitri-inventory-fuel-routine', station_id: 'maitri', metadata: { quantity: 82000 } },
  { actor: 'dev@himadri.local', action: 'device.approved', target: 'maitri-power-solar-array-01', station_id: 'maitri', metadata: null },
  { actor: 'ops@himadri.local', action: 'convoy.assign', target: 'maitri-convoy-fuel-station-run', station_id: 'maitri', metadata: { member: 'Dr. Mehta' } },
  { actor: 'ops@himadri.local', action: 'convoy.depart', target: 'maitri-convoy-fuel-station-run', station_id: 'maitri', metadata: null },
  { actor: 'dev@himadri.local', action: 'scenario.run', target: 'mock-seed-1', station_id: 'maitri', metadata: { preset: 'resupply_fails' } },
  { actor: 'ops@himadri.local', action: 'alert.ack', target: 'alert-bharati-001', station_id: 'bharati', metadata: { note: 'Filter on order' } },
]

// A small dependency-free SHA-256 (browser + Node both expose SubtleCrypto,
// but that's async; this stays synchronous so the mock module can build its
// chain at import time like every other mockData/*.ts file does).
// Public-domain-style compact implementation — output verified against
// Node's crypto.createHash('sha256') for this file's fixed ROWS above.
function sha256Hex(input: string): string {
  function rightRotate(x: number, n: number) { return (x >>> n) | (x << (32 - n)) }
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19

  const bytes = new TextEncoder().encode(input)
  const bitLen = bytes.length * 8
  const withOne = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6)
  withOne.set(bytes)
  withOne[bytes.length] = 0x80
  const dv = new DataView(withOne.buffer)
  dv.setUint32(withOne.length - 4, bitLen >>> 0)
  dv.setUint32(withOne.length - 8, Math.floor(bitLen / 0x100000000))

  const w = new Int32Array(64)
  for (let offset = 0; offset < withOne.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getInt32(offset + i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0
    }
    let [a, b, c, d, e, f, g, h] = [h0, h1, h2, h3, h4, h5, h6, h7]
    for (let i = 0; i < 64; i++) {
      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + S1 + ch + K[i] + w[i]) | 0
      const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) | 0
      h = g; g = f; f = e; e = (d + temp1) | 0
      d = c; c = b; b = a; a = (temp1 + temp2) | 0
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('')
}

function computeHash(prevHash: string, body: Omit<AuditEntry, 'seq' | 'created_at' | 'hash'> & { seq: number; created_at: string }): string {
  return sha256Hex(prevHash + JSON.stringify(body))
}

function buildChain(): AuditEntry[] {
  let prev = GENESIS_HASH
  const out: AuditEntry[] = []
  ROWS.forEach((row, i) => {
    const seq = i + 1
    const created_at = hoursAgo((ROWS.length - i) * 5)
    const hash = computeHash(prev, { ...row, seq, created_at })
    out.push({ ...row, seq, created_at, hash })
    prev = hash
  })
  return out
}

export const mockAuditLog: AuditEntry[] = buildChain()

export function mockVerifyChain(): AuditVerifyResult {
  let prev = GENESIS_HASH
  for (const row of mockAuditLog) {
    const { hash, ...rest } = row
    const expected = computeHash(prev, rest)
    if (expected !== hash) {
      return { valid: false, checked: row.seq, broken_at_seq: row.seq, message: `Hash chain broken at seq ${row.seq}` }
    }
    prev = hash
  }
  return { valid: true, checked: mockAuditLog.length, broken_at_seq: null, message: 'Hash chain intact' }
}
