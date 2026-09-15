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
/**
 * Better Auth prefixes the session cookie with `__Secure-` whenever it issues it
 * over HTTPS - which is every deployment, but not local development. Checking
 * only the bare name makes every production request look anonymous: this file
 * redirects to sign-in, the sign-in page validates the session properly, sees a
 * user and redirects back, and the browser gives up with a redirect loop.
 */
const SESSION_COOKIES = [SESSION_COOKIE, `__Secure-${SESSION_COOKIE}`]
const CORRELATION_HEADER = 'x-correlation-id'
const NONCE_HEADER = 'x-nonce'

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

  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

/**
 * Content Security Policy.
 *
 * Built per request because script-src carries a fresh nonce; Next reads the
 * nonce from the request header and stamps it onto its own script tags.
 *
 * `style-src` allows inline styles, which is not ideal but is unavoidable while
 * Next injects critical CSS inline. `connect-src` is limited to same-origin -
 * there is no third-party telemetry in this application and no reason for the
 * page to reach anywhere else.
 */
function contentSecurityPolicy(nonce: string): string {
  const isProduction = process.env.NODE_ENV === 'production'

  // The dev server evaluates code for hot reloading; production never may.
  const scriptSrc = isProduction
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`

  return [
    `default-src 'self'`,
    scriptSrc,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    // 'self' does not cover the ws: scheme, which the dev server's hot reload uses.
    isProduction ? `connect-src 'self'` : `connect-src 'self' ws: wss:`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    ...(isProduction ? ['upgrade-insecure-requests'] : []),
  ].join('; ')
}

function withSecurityHeaders(response: NextResponse, nonce: string): NextResponse {
  response.headers.set('Content-Security-Policy', contentSecurityPolicy(nonce))
  return response
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(CORRELATION_HEADER, crypto.randomUUID())
  requestHeaders.set(NONCE_HEADER, nonce)

  // Defence in depth: strip the header behind CVE-2025-29927 regardless of the
  // running version, in case the reverse proxy in front is misconfigured.
  requestHeaders.delete('x-middleware-subrequest')

  const hasSessionCookie = SESSION_COOKIES.some((name) => request.cookies.has(name))

  if (!isPublicPath(pathname) && !hasSessionCookie) {
    const signIn = new URL('/sign-in', request.url)
    if (pathname !== '/') signIn.searchParams.set('next', `${pathname}${search}`)
    return withSecurityHeaders(NextResponse.redirect(signIn), nonce)
  }

  return withSecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), nonce)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)',
  ],
}
