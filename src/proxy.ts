import { NextResponse, type NextRequest } from 'next/server'

/**
 * Edge-of-application request handling.
 *
 * This is a user-experience convenience, NOT a security boundary. It looks for
 * the presence of a session cookie and redirects anonymous visitors to sign-in
 * so they do not watch a protected page render and then fail. It never decides
 * whether a request is allowed.
 *
 * That distinction is load-bearing: CVE-2025-29927 allowed middleware to be
 * skipped entirely with a crafted header, which silently disabled every check
 * that lived here. Real authorization therefore happens in the data access layer
 * and is re-verified inside every Server Action.
 *
 * It also issues the correlation id that ties a request's log lines together.
 */
const SESSION_COOKIE = 'arkham.session_token'
const CORRELATION_HEADER = 'x-correlation-id'

const PUBLIC_PREFIXES = [
  '/sign-in',
  '/forgot-password',
  '/reset-password',
  '/activate',
  '/api/auth',
  '/api/health',
]

function isPublicPath(pathname: string): boolean {
  // The design system gallery is a development-only catalogue; the page itself
  // also returns 404 in production, so this never widens the production surface.
  if (process.env.NODE_ENV !== 'production' && pathname.startsWith('/dev/')) return true

  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(CORRELATION_HEADER, crypto.randomUUID())

  // Defence in depth: strip the header behind CVE-2025-29927 regardless of the
  // running version, in case the reverse proxy in front is misconfigured.
  requestHeaders.delete('x-middleware-subrequest')

  if (isPublicPath(pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  const hasSessionCookie = request.cookies.has(SESSION_COOKIE)

  if (!hasSessionCookie) {
    const signIn = new URL('/sign-in', request.url)
    if (pathname !== '/') signIn.searchParams.set('next', `${pathname}${search}`)
    return NextResponse.redirect(signIn)
  }

  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)'],
}
