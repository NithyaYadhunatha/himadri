// scripts/seedLabInstrumentBusinessMeta.js
//
// One-time seed for the 6 lab_instrument nodes added to the Waters demo
// topology (InfraMind.py/scripts/seed_waters_demo.py) — they had no
// NodeBusinessMeta record, so the CAB Co-Pilot's revenue-at-risk figures
// (src/lib/pricing/revenueRiskModel.json's "no data = no unfounded claim"
// design) correctly-but-uselessly showed $0/bronze for every one of them,
// even though they're the instruments actually producing patient/scientist
// analytical data. This is a real gap to close with real operator-entered
// numbers, not a bug in the $0-default logic itself.
//
// Run manually after (re)seeding the backend: `node scripts/seedLabInstrumentBusinessMeta.js`
// Idempotent — upserts by nodeKey, safe to re-run. Requires the FastAPI
// backend to be reachable (to resolve each instrument's real node id) and
// MONGODB_URI in .env.local to point at the frontend's Mongo.

const fs = require('fs')
const path = require('path')
const mongoose = require('mongoose')

// No `dotenv` dependency in this repo — minimal inline .env.local parser
// (KEY=VALUE per line, '#' comments, blank lines skipped) rather than
// adding a new package just for this one-off script.
function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}
loadEnvLocal()

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN || ''
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_URL

// revenuePerHour: rough cost of an hour of this instrument being down —
// lost analytical throughput + delayed batch release / regulatory
// reporting, scaled to each instrument's role. slaTier/criticality reflect
// how directly each one gates a regulated release process vs. a
// supporting/prep role. businessProcesses reuse the exact names already
// used elsewhere in the app (src/lib/mockData/mockBusinessProcess.ts) so
// they line up with the same process vocabulary the CAB Co-Pilot shows.
const ENTRIES = {
  'alliance-is-bio-milford': {
    revenuePerHour: 650,
    slaTier: 'platinum',
    criticality: 'critical',
    businessProcesses: ['Sample Batch Release'],
    description: 'Bio-inert HPLC — peptide map QC gating batch release.',
  },
  'bioaccord-lcms-milford': {
    revenuePerHour: 700,
    slaTier: 'platinum',
    criticality: 'critical',
    businessProcesses: ['Sample Batch Release', 'Analytical Data Management'],
    description: 'Biopharma LC-MS — intact mass/MAM QC gating batch release.',
  },
  'andrew-plus-milford': {
    revenuePerHour: 350,
    slaTier: 'gold',
    criticality: 'high',
    businessProcesses: ['Instrument Qualification (IQ/OQ/PQ)'],
    description: 'Automated pipetting robot — sample prep throughput, supports downstream QC.',
  },
  'alliance-hplc-milford': {
    revenuePerHour: 600,
    slaTier: 'platinum',
    criticality: 'critical',
    businessProcesses: ['Sample Batch Release'],
    description: 'Alliance e2695 HPLC — release testing assay, directly gates batch release.',
  },
  'xevo-mrt-p10-milford': {
    revenuePerHour: 800,
    slaTier: 'platinum',
    criticality: 'critical',
    businessProcesses: ['Analytical Data Management', 'Instrument Qualification (IQ/OQ/PQ)'],
    description: 'Multi-Reflecting TOF mass spectrometer — high-value analytical capacity.',
  },
  'maldi-desi-milford': {
    revenuePerHour: 500,
    slaTier: 'gold',
    criticality: 'high',
    businessProcesses: ['Analytical Data Management'],
    description: 'MALDI/DESI mass spec imaging — specialized analytical workload.',
  },
}

async function fetchNodeIds() {
  const res = await fetch(`${API_BASE}/nodes`, {
    headers: { Authorization: `Bearer ${API_TOKEN}` },
  })
  if (!res.ok) throw new Error(`GET /nodes failed: ${res.status}`)
  const nodes = await res.json()
  const idByName = new Map(nodes.map((n) => [n.name, n.id]))
  return idByName
}

async function main() {
  if (!MONGODB_URI) throw new Error('MONGODB_URI (or MONGODB_URL) not set in .env.local')

  console.log('Resolving lab_instrument node ids from the live backend...')
  const idByName = await fetchNodeIds()

  const NodeBusinessMeta = mongoose.model(
    'NodeBusinessMeta',
    new mongoose.Schema(
      {
        nodeKey: { type: String, required: true, unique: true, index: true },
        revenuePerHour: { type: Number, default: 0, min: 0 },
        slaTier: { type: String, default: 'bronze', index: true },
        businessProcesses: { type: [String], default: [], index: true },
        criticality: { type: String, default: 'medium', index: true },
        notes: { type: String, default: '' },
        description: { type: String, default: '' },
        nodeActions: { type: [String], default: [] },
        department: { type: String, default: null, index: true },
        lifecycleStage: { type: String, default: 'active', index: true },
      },
      { timestamps: true },
    ),
  )

  await mongoose.connect(MONGODB_URI)
  console.log('Connected to Mongo. Upserting NodeBusinessMeta for 6 lab instruments...')

  for (const [name, meta] of Object.entries(ENTRIES)) {
    const nodeKey = idByName.get(name)
    if (!nodeKey) {
      console.warn(`   ! Skipping ${name} — not found in the live backend's node list`)
      continue
    }
    await NodeBusinessMeta.findOneAndUpdate(
      { nodeKey },
      { $set: { nodeKey, ...meta } },
      { upsert: true },
    )
    console.log(`   + ${name} (${nodeKey}) -> $${meta.revenuePerHour}/hr, ${meta.slaTier}, ${meta.criticality}`)
  }

  await mongoose.disconnect()
  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
