import { beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { campaignIntegration } from '@/db/schema'
import { ForbiddenError, NotFoundError } from '@/lib/errors'
import { addMemberRow, createCampaignRow, createUserRow, truncateAll } from './helpers/fixtures'

const NOW = new Date('2026-09-16T18:00:00.000Z')
const viewerId = { current: '' }

vi.mock('@/lib/auth', () => ({
  requireUser: () =>
    Promise.resolve({
      id: viewerId.current,
      name: 'Viewer',
      email: 'viewer@example.test',
      role: 'user',
      status: 'ACTIVE',
    }),
}))

const {
  deleteDiscordWebhook,
  getDiscordStatus,
  readDiscordWebhook,
  recordIntegrationError,
  saveDiscordWebhook,
} = await import('@/modules/notifications/data/integrations')
const { requireOwner } = await import('@/modules/campaigns/data/guards')

beforeEach(async () => {
  await truncateAll()
})

describe('Discord integration persistence', () => {
  it('encrypts the credential at rest and never returns it in status', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const campaign = await createCampaignRow({ ownerId: owner.id, status: 'ACTIVE' })
    const url = 'https://discord.com/api/webhooks/123456789/very_secret_token'

    await saveDiscordWebhook({
      campaignId: campaign.id,
      url,
      createdBy: owner.id,
      now: NOW,
    })

    const [stored] = await db
      .select()
      .from(campaignIntegration)
      .where(eq(campaignIntegration.campaignId, campaign.id))

    expect(JSON.stringify(stored?.config)).not.toContain(url)
    expect(JSON.stringify(stored?.config)).not.toContain('very_secret_token')
    await expect(readDiscordWebhook(campaign.id)).resolves.toBe(url)
    await expect(getDiscordStatus(campaign.id)).resolves.toMatchObject({
      configured: true,
      enabled: true,
      lastError: null,
    })
  })

  it('records and clears an error without replacing the encrypted webhook', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const campaign = await createCampaignRow({ ownerId: owner.id, status: 'ACTIVE' })
    const url = 'https://discord.com/api/webhooks/123456789/original_token'

    await saveDiscordWebhook({
      campaignId: campaign.id,
      url,
      createdBy: owner.id,
      now: NOW,
    })
    await recordIntegrationError({
      campaignId: campaign.id,
      error: 'x'.repeat(350),
      now: new Date(NOW.getTime() + 1_000),
    })

    expect((await getDiscordStatus(campaign.id)).lastError).toHaveLength(300)
    await expect(readDiscordWebhook(campaign.id)).resolves.toBe(url)

    await recordIntegrationError({
      campaignId: campaign.id,
      error: null,
      now: new Date(NOW.getTime() + 2_000),
    })

    expect((await getDiscordStatus(campaign.id)).lastError).toBeNull()
    await expect(readDiscordWebhook(campaign.id)).resolves.toBe(url)
  })

  it('replaces and removes the webhook without leaving an old credential', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const campaign = await createCampaignRow({ ownerId: owner.id, status: 'ACTIVE' })
    const first = 'https://discord.com/api/webhooks/123456789/first_token'
    const second = 'https://discord.com/api/webhooks/123456789/second_token'

    await saveDiscordWebhook({
      campaignId: campaign.id,
      url: first,
      createdBy: owner.id,
      now: NOW,
    })
    await saveDiscordWebhook({
      campaignId: campaign.id,
      url: second,
      createdBy: owner.id,
      now: new Date(NOW.getTime() + 1_000),
    })

    await expect(readDiscordWebhook(campaign.id)).resolves.toBe(second)
    await deleteDiscordWebhook({ campaignId: campaign.id })
    await expect(readDiscordWebhook(campaign.id)).resolves.toBeNull()
    await expect(getDiscordStatus(campaign.id)).resolves.toEqual({
      configured: false,
      enabled: false,
      lastError: null,
      updatedAt: null,
    })
  })
})

describe('Discord integration authorization', () => {
  it('allows only the campaign owner, not another Keeper or an outsider', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const keeper = await createUserRow({ status: 'ACTIVE' })
    const outsider = await createUserRow({ status: 'ACTIVE' })
    const campaign = await createCampaignRow({ ownerId: owner.id, status: 'ACTIVE' })
    await addMemberRow({ campaignId: campaign.id, userId: keeper.id, role: 'KEEPER' })

    viewerId.current = owner.id
    await expect(requireOwner(campaign.id)).resolves.toMatchObject({
      membership: { isOwner: true },
    })

    viewerId.current = keeper.id
    await expect(requireOwner(campaign.id)).rejects.toBeInstanceOf(ForbiddenError)

    viewerId.current = outsider.id
    await expect(requireOwner(campaign.id)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('keeps one integration row per campaign and type', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const campaign = await createCampaignRow({ ownerId: owner.id, status: 'ACTIVE' })

    for (const token of ['first', 'second', 'third']) {
      await saveDiscordWebhook({
        campaignId: campaign.id,
        url: `https://discord.com/api/webhooks/123456789/${token}`,
        createdBy: owner.id,
        now: NOW,
      })
    }

    const rows = await db
      .select()
      .from(campaignIntegration)
      .where(
        and(
          eq(campaignIntegration.campaignId, campaign.id),
          eq(campaignIntegration.type, 'DISCORD_WEBHOOK'),
        ),
      )
    expect(rows).toHaveLength(1)
  })
})
