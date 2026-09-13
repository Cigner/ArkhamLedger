import 'server-only'
import { headers } from 'next/headers'
import { auth } from './config'

/**
 * Authentication port.
 *
 * The application depends on this interface, not on the auth library. Two
 * reasons, in order of importance: a breaking upgrade of the library changes one
 * implementation rather than every call site, and the surface the rest of the
 * code can reach is deliberately narrower than the library's own.
 *
 * Every method reads the session from the incoming request headers rather than
 * from a cached value, because authorization decisions must reflect the session
 * as it is now — an account disabled a second ago must not pass.
 */
export type GlobalRole = 'admin' | 'user'
export type UserStatus = 'PENDING_ACTIVATION' | 'ACTIVE' | 'DISABLED'

export type AuthenticatedUser = {
  readonly id: string
  readonly email: string
  readonly name: string
  readonly role: GlobalRole
  readonly status: UserStatus
  readonly timezone: string
  readonly locale: string
}

export type CreateUserInput = {
  readonly email: string
  readonly name: string
  readonly role: GlobalRole
  /** Random placeholder; replaced when the user consumes their activation link. */
  readonly temporaryPassword: string
}

export interface AuthPort {
  /** Current user, or null when the request carries no valid session. */
  getCurrentUser(): Promise<AuthenticatedUser | null>
  createUser(input: CreateUserInput): Promise<{ id: string }>
  setPassword(userId: string, password: string): Promise<void>
  /** Invalidates every session of a user; used on password change and disable. */
  revokeAllSessions(userId: string): Promise<void>
}

type SessionUserRecord = {
  id: string
  email: string
  name: string
  role?: string | null
  status?: string | null
  timezone?: string | null
  locale?: string | null
}

function toAuthenticatedUser(record: SessionUserRecord): AuthenticatedUser {
  return {
    id: record.id,
    email: record.email,
    name: record.name,
    role: record.role === 'admin' ? 'admin' : 'user',
    status: (record.status as UserStatus | null) ?? 'ACTIVE',
    timezone: record.timezone ?? 'Europe/Warsaw',
    locale: record.locale ?? 'en',
  }
}

export const authPort: AuthPort = {
  async getCurrentUser() {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return null
    return toAuthenticatedUser(session.user as SessionUserRecord)
  },

  async createUser(input) {
    const created = await auth.api.createUser({
      body: {
        email: input.email,
        name: input.name,
        password: input.temporaryPassword,
        role: input.role,
      },
      headers: await headers(),
    })
    return { id: created.user.id }
  },

  async setPassword(userId, password) {
    await auth.api.setUserPassword({
      body: { userId, newPassword: password },
      headers: await headers(),
    })
  },

  async revokeAllSessions(userId) {
    await auth.api.revokeUserSessions({
      body: { userId },
      headers: await headers(),
    })
  },
}
