import { toNextJsHandler } from 'better-auth/next-js'
import { auth } from '@/lib/auth'

/**
 * Authentication endpoints.
 *
 * Delegates every route the auth library owns - sign in, sign out, password
 * reset, session refresh. CSRF is handled by the library's trusted-origin check
 * rather than by Next's Server Action protection, which does not apply to route
 * handlers.
 */
export const { GET, POST } = toNextJsHandler(auth.handler)
