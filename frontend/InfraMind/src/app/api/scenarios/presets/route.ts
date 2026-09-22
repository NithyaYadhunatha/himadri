// GET — proxies FastAPI's GET /scenarios/presets (What-If Scenario presets).
import { forwardToBackend } from '@/lib/apiProxy'

export async function GET(req: Request) {
  return forwardToBackend(req, '/scenarios/presets')
}
