import { NextResponse } from 'next/server'
import { forwardToBackend } from '@/lib/apiProxy'

const ALLOWED_PATHS = new Set(['accuracy', 'forecast', 'predictions', 'drift', 'retrain'])

type Context = { params: Promise<{ path: string[] }> }

async function proxy(req: Request, { params }: Context) {
  const { path } = await params
  if (path.length !== 1 || !ALLOWED_PATHS.has(path[0])) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return forwardToBackend(req, `/model-accuracy/${path[0]}`)
}

export { proxy as GET, proxy as POST }
