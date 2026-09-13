import 'server-only'
import { ForbiddenError, UnauthorizedError } from '@/lib/errors'
import { securityLogger } from '@/lib/logger'
import { authPort, type AuthenticatedUser } from './port'

/**
 * Global authorization guards.
 *
 * These run inside the data access layer and inside every Server Action, never
 * only in the proxy. Middleware is bypassable — CVE-2025-29927 demonstrated
 * exactly that — so it is treated as a redirect convenience and nothing more.
 *
 * Campaign-scoped guards live with the campaigns module, because they need its
 * membership table; these two cover identity only.
 */
export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await authPort.getCurrentUser()

  if (!user) throw new UnauthorizedError()

  // A session can outlive the account being disabled or awaiting activation.
  if (user.status !== 'ACTIVE') {
    securityLogger.warn({ userId: user.id, status: user.status }, 'inactive user rejected')
    throw new UnauthorizedError()
  }

  return user
}

export async function requireAdmin(): Promise<AuthenticatedUser> {
  const user = await requireUser()

  if (user.role !== 'admin') {
    securityLogger.warn({ userId: user.id }, 'admin access denied')
    throw new ForbiddenError()
  }

  return user
}

/** Non-throwing variant for layouts that render differently when signed out. */
export async function getOptionalUser(): Promise<AuthenticatedUser | null> {
  const user = await authPort.getCurrentUser()
  return user?.status === 'ACTIVE' ? user : null
}
