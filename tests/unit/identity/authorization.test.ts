import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedUser } from '@/lib/auth/port'
import { ForbiddenError, UnauthorizedError } from '@/lib/errors'

/**
 * Global authorization guards.
 *
 * Exercised as a matrix of (session state) x (guard), because these are the two
 * functions that stand between a request and every piece of data in the system,
 * and a gap in one cell is a gap everywhere it is used.
 *
 * The auth port is substituted rather than the database, so what is under test
 * is the decision itself and not how a session happens to be stored.
 */
const getCurrentUser = vi.fn<() => Promise<AuthenticatedUser | null>>()

vi.mock('@/lib/auth/port', () => ({
  authPort: { getCurrentUser: () => getCurrentUser() },
}))

vi.mock('server-only', () => ({}))

const { getOptionalUser, requireAdmin, requireUser } = await import('@/lib/auth/guards')

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'user-1',
    email: 'someone@example.test',
    name: 'Someone',
    role: 'user',
    status: 'ACTIVE',
    timezone: 'Europe/Warsaw',
    locale: 'en',
    ...overrides,
  }
}

beforeEach(() => {
  getCurrentUser.mockReset()
})

describe('requireUser', () => {
  it('returns an active user', async () => {
    getCurrentUser.mockResolvedValue(user())
    await expect(requireUser()).resolves.toMatchObject({ id: 'user-1' })
  })

  it('rejects an anonymous request', async () => {
    getCurrentUser.mockResolvedValue(null)
    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError)
  })

  /*
   * A session outlives the account state that issued it. An account disabled or
   * reset to pending a moment ago must stop working immediately, not when the
   * cookie eventually expires.
   */
  it.each(['DISABLED', 'PENDING_ACTIVATION'] as const)('rejects a %s account', async (status) => {
    getCurrentUser.mockResolvedValue(user({ status }))
    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError)
  })
})

describe('requireAdmin', () => {
  it('allows an active administrator', async () => {
    getCurrentUser.mockResolvedValue(user({ role: 'admin' }))
    await expect(requireAdmin()).resolves.toMatchObject({ role: 'admin' })
  })

  it('refuses an ordinary user', async () => {
    getCurrentUser.mockResolvedValue(user({ role: 'user' }))
    await expect(requireAdmin()).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('refuses an anonymous request before it considers the role', async () => {
    getCurrentUser.mockResolvedValue(null)
    await expect(requireAdmin()).rejects.toBeInstanceOf(UnauthorizedError)
  })

  /*
   * A disabled administrator is refused as unauthenticated rather than
   * forbidden: the account state is checked first, so the role never gets a say.
   */
  it('refuses a disabled administrator', async () => {
    getCurrentUser.mockResolvedValue(user({ role: 'admin', status: 'DISABLED' }))
    await expect(requireAdmin()).rejects.toBeInstanceOf(UnauthorizedError)
  })
})

describe('getOptionalUser', () => {
  it('returns null instead of throwing for anonymous requests', async () => {
    getCurrentUser.mockResolvedValue(null)
    await expect(getOptionalUser()).resolves.toBeNull()
  })

  it('treats a non-active account as signed out', async () => {
    getCurrentUser.mockResolvedValue(user({ status: 'DISABLED' }))
    await expect(getOptionalUser()).resolves.toBeNull()
  })

  it('returns an active user', async () => {
    getCurrentUser.mockResolvedValue(user())
    await expect(getOptionalUser()).resolves.toMatchObject({ id: 'user-1' })
  })
})
