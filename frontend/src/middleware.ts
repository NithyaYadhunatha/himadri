import { NextResponse } from 'next/server'
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

// Local-dev-only: NEXT_PUBLIC_DEV_BYPASS_AUTH=true skips every Clerk check
// (no keys needed) so this app can run standalone against mock data. See
// src/lib/auth/devBypass.ts for the matching rbac.ts/layout.tsx/Navbar
// bypasses — never flip this on outside local testing.
const DEV_BYPASS_AUTH = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true'

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks/clerk',
])

const withClerk = clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect()
  }
})

export default function middleware(req: Parameters<typeof withClerk>[0], event: Parameters<typeof withClerk>[1]) {
  if (DEV_BYPASS_AUTH) return NextResponse.next()
  return withClerk(req, event)
}

export const config = {
  matcher: [
    // /unity/ is the static Unity WebGL export (incl. StreamingAssets/*.json the player fetches).
    '/((?!_next|unity/|[^?]*\\.(?:html?|css|js(?!on)|wasm|data|gz|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
    '/__clerk/:path*',
  ],
}
