import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { authUser, userActivationToken } from '@/db/schema'
import { hashToken } from '@/lib/crypto'
import {
  checkActivationToken,
  claimActivationToken,
  deleteExpiredActivationTokens,
  issueActivationToken,
  markAccountActivated,
} from '@/modules/identity/data/activation'
import { createUserRow, truncateAll } from './helpers/fixtures'

/**
 * Activation token lifecycle against a real database.
 *
 * These behaviours live in the database rather than in the code: the unique
 * index, the conditional update, and the transaction boundary are what make
 * single use actually single. Testing them against a substitute would prove
 * nothing about production.
 */
const HOUR = 60 * 60 * 1000

beforeEach(async () => {
  await truncateAll()
})

describe('issuing', () => {
  it('stores only the digest, never the token', async () => {
    const user = await createUserRow()
    const now = new Date()

    const { token } = await issueActivationToken(user.id, user.id, now)

    const rows = await db.select().from(userActivationToken)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.tokenHash).toBe(hashToken(token))
    expect(rows[0]?.tokenHash).not.toBe(token)
    expect(JSON.stringify(rows)).not.toContain(token)
  })

  it('revokes any outstanding link for the same user', async () => {
    const user = await createUserRow()
    const now = new Date()

    const first = await issueActivationToken(user.id, user.id, now)
    const second = await issueActivationToken(user.id, user.id, new Date(now.getTime() + 1000))

    expect(await checkActivationToken(first.token, new Date())).toMatchObject({
      ok: false,
      reason: 'ALREADY_USED',
    })
    expect(await checkActivationToken(second.token, new Date())).toMatchObject({ ok: true })
  })

  it('sets the expiry a week out', async () => {
    const user = await createUserRow()
    const now = new Date('2026-09-14T12:00:00Z')

    const { expiresAt } = await issueActivationToken(user.id, user.id, now)

    expect(expiresAt.getTime() - now.getTime()).toBe(7 * 24 * HOUR)
  })
})

describe('checking', () => {
  it('accepts a fresh token and reports who it belongs to', async () => {
    const user = await createUserRow({ name: 'Anna Kowalska' })
    const { token } = await issueActivationToken(user.id, user.id, new Date())

    const result = await checkActivationToken(token, new Date())

    expect(result).toMatchObject({ ok: true, userId: user.id, name: 'Anna Kowalska' })
  })

  it('rejects an unknown token', async () => {
    const result = await checkActivationToken('not-a-real-token-value-padding-1234', new Date())
    expect(result).toEqual({ ok: false, reason: 'INVALID' })
  })

  it('rejects an expired token', async () => {
    const user = await createUserRow()
    const issuedAt = new Date('2026-09-01T12:00:00Z')
    const { token } = await issueActivationToken(user.id, user.id, issuedAt)

    const result = await checkActivationToken(token, new Date('2026-09-09T12:00:00Z'))

    expect(result).toEqual({ ok: false, reason: 'EXPIRED' })
  })

  it('rejects a token whose account is already active', async () => {
    const user = await createUserRow()
    const { token } = await issueActivationToken(user.id, user.id, new Date())
    await db.update(authUser).set({ status: 'ACTIVE' }).where(eq(authUser.id, user.id))

    const result = await checkActivationToken(token, new Date())

    expect(result).toEqual({ ok: false, reason: 'ALREADY_USED' })
  })
})

describe('claiming', () => {
  it('consumes the token and activates the account', async () => {
    const user = await createUserRow()
    const now = new Date()
    const { token } = await issueActivationToken(user.id, user.id, now)

    await db.transaction(async (tx) => {
      const claimed = await claimActivationToken(token, now, tx)
      expect(claimed).toEqual({ userId: user.id })
      await markAccountActivated(user.id, now, tx)
    })

    const [row] = await db.select().from(authUser).where(eq(authUser.id, user.id))
    expect(row?.status).toBe('ACTIVE')
    expect(row?.emailVerified).toBe(true)
  })

  it('refuses a second claim of the same token', async () => {
    const user = await createUserRow()
    const now = new Date()
    const { token } = await issueActivationToken(user.id, user.id, now)

    await db.transaction(async (tx) => claimActivationToken(token, now, tx))
    const second = await db.transaction(async (tx) => claimActivationToken(token, now, tx))

    expect(second).toBeNull()
  })

  /*
   * The case a prior read cannot cover: both requests see an unused token, and
   * only the conditional UPDATE decides. Without it a shared link would activate
   * twice.
   */
  it('lets exactly one of two concurrent claims through', async () => {
    const user = await createUserRow()
    const now = new Date()
    const { token } = await issueActivationToken(user.id, user.id, now)

    const results = await Promise.all([
      db.transaction(async (tx) => claimActivationToken(token, now, tx)),
      db.transaction(async (tx) => claimActivationToken(token, now, tx)),
    ])

    expect(results.filter((result) => result !== null)).toHaveLength(1)
  })

  it('refuses an expired token even when it was never used', async () => {
    const user = await createUserRow()
    const issuedAt = new Date('2026-09-01T12:00:00Z')
    const { token } = await issueActivationToken(user.id, user.id, issuedAt)

    const claimed = await db.transaction(async (tx) =>
      claimActivationToken(token, new Date('2026-09-30T12:00:00Z'), tx),
    )

    expect(claimed).toBeNull()
  })
})

describe('housekeeping', () => {
  it('removes expired unused tokens and keeps live ones', async () => {
    const stale = await createUserRow()
    const fresh = await createUserRow()

    await issueActivationToken(stale.id, stale.id, new Date('2026-08-01T00:00:00Z'))
    await issueActivationToken(fresh.id, fresh.id, new Date('2026-09-14T00:00:00Z'))

    const removed = await deleteExpiredActivationTokens(new Date('2026-09-14T12:00:00Z'))

    expect(removed).toBe(1)
    expect(await db.select().from(userActivationToken)).toHaveLength(1)
  })
})

describe('constraints', () => {
  it('rejects a duplicate email at the database level', async () => {
    await createUserRow({ email: 'duplicate@example.test' })

    await expect(createUserRow({ email: 'duplicate@example.test' })).rejects.toThrow()
  })
})
