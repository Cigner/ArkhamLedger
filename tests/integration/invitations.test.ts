import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { campaignInvitation, campaignMember } from '@/db/schema'
import { hashToken } from '@/lib/crypto'
import {
  claimInvitation,
  createInvitation,
  previewInvitation,
  revokeInvitation,
} from '@/modules/campaigns/data/invitations'
import { deleteExpiredInvitations } from '@/modules/campaigns/data/maintenance'
import { addOrReviveMember, findMembership } from '@/modules/campaigns/data/members'
import { addMemberRow, createCampaignRow, createUserRow, truncateAll } from './helpers/fixtures'

/**
 * Invitation lifecycle against a real database.
 *
 * The properties under test are enforced by SQL, not by application code: the
 * conditional UPDATE that makes a use single, and the unique index that makes a
 * membership singular. A substitute database would confirm neither.
 */
const DAY = 24 * 60 * 60 * 1000

async function seedCampaign() {
  const owner = await createUserRow({ status: 'ACTIVE', name: 'Keeper' })
  const campaign = await createCampaignRow({ ownerId: owner.id })
  return { owner, campaignId: campaign.id }
}

async function issue(
  campaignId: string,
  createdBy: string,
  overrides: Partial<{ targetUserId: string | null; maxUses: number; now: Date }> = {},
) {
  return createInvitation({
    campaignId,
    targetUserId: overrides.targetUserId ?? null,
    roleOnJoin: 'INVESTIGATOR',
    maxUses: overrides.maxUses ?? 1,
    createdBy,
    now: overrides.now ?? new Date(),
    executor: db,
  })
}

beforeEach(async () => {
  await truncateAll()
})

describe('issuing', () => {
  it('stores only the digest', async () => {
    const { owner, campaignId } = await seedCampaign()

    const { token } = await issue(campaignId, owner.id)

    const rows = await db.select().from(campaignInvitation)
    expect(rows[0]?.tokenHash).toBe(hashToken(token))
    expect(JSON.stringify(rows)).not.toContain(token)
  })

  it('expires two weeks out', async () => {
    const { owner, campaignId } = await seedCampaign()
    const now = new Date('2026-09-14T12:00:00Z')

    const { expiresAt } = await issue(campaignId, owner.id, { now })

    expect(expiresAt.getTime() - now.getTime()).toBe(14 * DAY)
  })
})

describe('preview', () => {
  it('describes the campaign a visitor is being invited to', async () => {
    const { owner, campaignId } = await seedCampaign()
    const visitor = await createUserRow({ status: 'ACTIVE' })
    const { token } = await issue(campaignId, owner.id)

    const preview = await previewInvitation(token, visitor.id, new Date())

    expect(preview).toMatchObject({
      ok: true,
      campaignId,
      campaignName: 'The Haunting',
      keeperNames: ['Keeper'],
      memberCount: 1,
      alreadyMember: false,
    })
  })

  it('does not consume a use', async () => {
    const { owner, campaignId } = await seedCampaign()
    const visitor = await createUserRow({ status: 'ACTIVE' })
    const { token } = await issue(campaignId, owner.id)

    await previewInvitation(token, visitor.id, new Date())
    await previewInvitation(token, visitor.id, new Date())

    const [row] = await db.select().from(campaignInvitation)
    expect(row?.usedCount).toBe(0)
  })

  it('reports an existing member rather than refusing them', async () => {
    const { owner, campaignId } = await seedCampaign()
    const { token } = await issue(campaignId, owner.id)

    const preview = await previewInvitation(token, owner.id, new Date())

    expect(preview).toMatchObject({ ok: true, alreadyMember: true })
  })

  it.each([
    ['expired', async (campaignId: string, ownerId: string) => {
      const { token } = await issue(campaignId, ownerId, { now: new Date('2026-08-01T00:00:00Z') })
      return { token, at: new Date('2026-09-14T00:00:00Z'), reason: 'EXPIRED' as const }
    }],
    ['revoked', async (campaignId: string, ownerId: string) => {
      const { token } = await issue(campaignId, ownerId)
      const [row] = await db.select().from(campaignInvitation)
      await revokeInvitation(row!.id, campaignId, new Date())
      return { token, at: new Date(), reason: 'REVOKED' as const }
    }],
  ])('rejects a %s invitation', async (_label, prepare) => {
    const { owner, campaignId } = await seedCampaign()
    const visitor = await createUserRow({ status: 'ACTIVE' })

    const { token, at, reason } = await prepare(campaignId, owner.id)

    expect(await previewInvitation(token, visitor.id, at)).toEqual({ ok: false, reason })
  })

  it('rejects an unknown token', async () => {
    const visitor = await createUserRow({ status: 'ACTIVE' })
    expect(await previewInvitation('a'.repeat(43), visitor.id, new Date())).toEqual({
      ok: false,
      reason: 'INVALID',
    })
  })

  /*
   * A personal invitation names its recipient. Anyone else holding the link —
   * because it was forwarded, or found — is refused.
   */
  it('refuses a personal invitation presented by somebody else', async () => {
    const { owner, campaignId } = await seedCampaign()
    const intended = await createUserRow({ status: 'ACTIVE' })
    const bystander = await createUserRow({ status: 'ACTIVE' })
    const { token } = await issue(campaignId, owner.id, { targetUserId: intended.id })

    expect(await previewInvitation(token, bystander.id, new Date())).toEqual({
      ok: false,
      reason: 'NOT_FOR_YOU',
    })
    expect(await previewInvitation(token, intended.id, new Date())).toMatchObject({ ok: true })
  })
})

describe('claiming', () => {
  it('joins the campaign and increments the use count', async () => {
    const { owner, campaignId } = await seedCampaign()
    const visitor = await createUserRow({ status: 'ACTIVE' })
    const { token } = await issue(campaignId, owner.id)
    const now = new Date()

    await db.transaction(async (tx) => {
      const claimed = await claimInvitation(token, visitor.id, now, tx)
      expect(claimed).toMatchObject({ campaignId, roleOnJoin: 'INVESTIGATOR' })
      await addOrReviveMember({ campaignId, userId: visitor.id, role: 'INVESTIGATOR', now, executor: tx })
    })

    const [invitation] = await db.select().from(campaignInvitation)
    expect(invitation?.usedCount).toBe(1)
    expect(await findMembership(campaignId, visitor.id)).toMatchObject({ status: 'ACTIVE' })
  })

  it('refuses a second claim of a single-use link', async () => {
    const { owner, campaignId } = await seedCampaign()
    const first = await createUserRow({ status: 'ACTIVE' })
    const second = await createUserRow({ status: 'ACTIVE' })
    const { token } = await issue(campaignId, owner.id)
    const now = new Date()

    await db.transaction(async (tx) => claimInvitation(token, first.id, now, tx))
    const result = await db.transaction(async (tx) => claimInvitation(token, second.id, now, tx))

    expect(result).toBeNull()
  })

  /*
   * The case a prior read cannot cover: both requests see one use remaining, and
   * only the conditional UPDATE decides. Without it a shared link overshoots its
   * limit under any real concurrency.
   */
  it('lets exactly one of two concurrent claims take the last use', async () => {
    const { owner, campaignId } = await seedCampaign()
    const a = await createUserRow({ status: 'ACTIVE' })
    const b = await createUserRow({ status: 'ACTIVE' })
    const { token } = await issue(campaignId, owner.id, { maxUses: 1 })
    const now = new Date()

    const results = await Promise.all([
      db.transaction(async (tx) => claimInvitation(token, a.id, now, tx)),
      db.transaction(async (tx) => claimInvitation(token, b.id, now, tx)),
    ])

    expect(results.filter((result) => result !== null)).toHaveLength(1)

    const [invitation] = await db.select().from(campaignInvitation)
    expect(invitation?.usedCount).toBe(1)
  })

  it('never lets a shared link exceed its use count under concurrency', async () => {
    const { owner, campaignId } = await seedCampaign()
    const { token } = await issue(campaignId, owner.id, { maxUses: 3 })
    const now = new Date()

    const visitors = await Promise.all(
      Array.from({ length: 8 }, () => createUserRow({ status: 'ACTIVE' })),
    )

    const results = await Promise.all(
      visitors.map((visitor) =>
        db.transaction(async (tx) => claimInvitation(token, visitor.id, now, tx)),
      ),
    )

    expect(results.filter((result) => result !== null)).toHaveLength(3)

    const [invitation] = await db.select().from(campaignInvitation)
    expect(invitation?.usedCount).toBe(3)
  })

  it('refuses a revoked invitation even if uses remain', async () => {
    const { owner, campaignId } = await seedCampaign()
    const visitor = await createUserRow({ status: 'ACTIVE' })
    const { token } = await issue(campaignId, owner.id, { maxUses: 5 })
    const [row] = await db.select().from(campaignInvitation)
    await revokeInvitation(row!.id, campaignId, new Date())

    const result = await db.transaction(async (tx) =>
      claimInvitation(token, visitor.id, new Date(), tx),
    )

    expect(result).toBeNull()
  })
})

describe('rejoining', () => {
  /*
   * A returning player must land back on the same membership row. A second row
   * would be a duplicate the unique index refuses, and deleting the first would
   * discard the availability and attendance attached to it.
   */
  it('reactivates the original membership instead of creating a second', async () => {
    const { campaignId } = await seedCampaign()
    const player = await createUserRow({ status: 'ACTIVE' })
    await addMemberRow({ campaignId, userId: player.id, status: 'LEFT' })

    await db.transaction(async (tx) =>
      addOrReviveMember({
        campaignId,
        userId: player.id,
        role: 'INVESTIGATOR',
        now: new Date(),
        executor: tx,
      }),
    )

    const rows = await db
      .select()
      .from(campaignMember)
      .where(eq(campaignMember.userId, player.id))

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: 'ACTIVE', leftAt: null })
  })
})

describe('housekeeping', () => {
  it('removes expired invitations and keeps live ones', async () => {
    const { owner, campaignId } = await seedCampaign()
    await issue(campaignId, owner.id, { now: new Date('2026-08-01T00:00:00Z') })
    await issue(campaignId, owner.id, { now: new Date('2026-09-14T00:00:00Z') })

    const removed = await deleteExpiredInvitations(new Date('2026-09-14T12:00:00Z'))

    expect(removed).toBe(1)
    expect(await db.select().from(campaignInvitation)).toHaveLength(1)
  })
})
