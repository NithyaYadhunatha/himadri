// GET — proxies FastAPI's GET /audit/verify (hash-chain integrity check).
// Deliberately left unscoped by station: the hash chain covers the *entire*
// append-only log as one sequence (each row's hash covers the previous
// row's), so "verify only my station's slice" isn't a meaningful operation —
// splitting it would either be wrong (checking a broken sub-chain) or
// require re-deriving a per-station chain the backend doesn't compute. The
// response is a pass/fail + first-broken-row summary, not station-tagged
// records, so there's nothing here for scoping to hide.
import { forwardToBackend } from '@/lib/apiProxy'

export async function GET(req: Request) {
  return forwardToBackend(req, '/audit/verify')
}
