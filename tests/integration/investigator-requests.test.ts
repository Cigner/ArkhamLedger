import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db/client'
import { campaignInvestigator, investigator, investigatorLineage } from '@/db/schema'
import { newId } from '@/lib/ids'
import { listCampaignsToRequestFor } from '@/modules/investigators/data/campaign-bindings'
import { addMemberRow, createCampaignRow, createUserRow, truncateAll } from './helpers/fixtures'

/**
 * What a Keeper may ask for.
 *
 * Section 11: a Keeper cannot take somebody else's character, so the only move
 * available to them is an invitation. This list is what makes the invitation
 * possible and is the whole of its authorization - every refusal below is a
 * campaign that must never be offered rather than an error message.
 */
const NOW = new Date('2026-09-14T12:00:00.000Z')

async function createInvestigatorRow(ownerId: string) {
  const lineageId = newId()
  const investigatorId = newId()

  await db.insert(investigatorLineage).values({ id: lineageId, createdBy: ownerId, createdAt: NOW })
  await db.insert(investigator).values({
    id: investigatorId,
    lineageId,
    ownerId,
    creatorId: ownerId,
    status: 'ACTIVE',
    creationMethod: 'STANDARD_ROLLS',
    rulesetId: 'coc7-classic-1920s',
    rulesetVersion: '1.0.0',
    era: 'CLASSIC_1920S',
    createdAt: NOW,
    updatedAt: NOW,
  })

  return investigatorId
}

beforeEach(async () => {
  await truncateAll()
})

describe('campaigns a Keeper can ask for a character in', () => {
  it('offers a campaign the Keeper runs and the owner already plays in', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const keeper = await createUserRow({ status: 'ACTIVE' })
    const campaign = await createCampaignRow({ ownerId: keeper.id, name: 'The Tatterdemalion' })
    await addMemberRow({ campaignId: campaign.id, userId: owner.id })

    const investigatorId = await createInvestigatorRow(owner.id)

    const offered = await listCampaignsToRequestFor({
      investigatorId,
      keeperId: keeper.id,
      ownerId: owner.id,
    })

    expect(offered).toEqual([{ campaignId: campaign.id, name: 'The Tatterdemalion' }])
  })

  it('offers nothing when the owner is not in the campaign', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const keeper = await createUserRow({ status: 'ACTIVE' })
    await createCampaignRow({ ownerId: keeper.id })

    const investigatorId = await createInvestigatorRow(owner.id)

    expect(
      await listCampaignsToRequestFor({ investigatorId, keeperId: keeper.id, ownerId: owner.id }),
    ).toEqual([])
  })

  it('offers nothing to somebody who only plays in the campaign', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const keeper = await createUserRow({ status: 'ACTIVE' })
    const player = await createUserRow({ status: 'ACTIVE' })
    const campaign = await createCampaignRow({ ownerId: keeper.id })
    await addMemberRow({ campaignId: campaign.id, userId: owner.id })
    await addMemberRow({ campaignId: campaign.id, userId: player.id })

    const investigatorId = await createInvestigatorRow(owner.id)

    expect(
      await listCampaignsToRequestFor({ investigatorId, keeperId: player.id, ownerId: owner.id }),
    ).toEqual([])
  })

  it('stops offering a campaign the character is already in', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const keeper = await createUserRow({ status: 'ACTIVE' })
    const campaign = await createCampaignRow({ ownerId: keeper.id })
    await addMemberRow({ campaignId: campaign.id, userId: owner.id })

    const investigatorId = await createInvestigatorRow(owner.id)
    await db.insert(campaignInvestigator).values({
      id: newId(),
      campaignId: campaign.id,
      investigatorId,
      linkedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    })

    expect(
      await listCampaignsToRequestFor({ investigatorId, keeperId: keeper.id, ownerId: owner.id }),
    ).toEqual([])
  })

  /*
   * A character that left is a character that can be asked for again. The
   * binding is the relationship, and an ended one is not one.
   */
  it('offers a campaign the character has left', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const keeper = await createUserRow({ status: 'ACTIVE' })
    const campaign = await createCampaignRow({ ownerId: keeper.id })
    await addMemberRow({ campaignId: campaign.id, userId: owner.id })

    const investigatorId = await createInvestigatorRow(owner.id)
    await db.insert(campaignInvestigator).values({
      id: newId(),
      campaignId: campaign.id,
      investigatorId,
      linkedAt: NOW,
      unlinkedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    })

    expect(
      await listCampaignsToRequestFor({ investigatorId, keeperId: keeper.id, ownerId: owner.id }),
    ).toHaveLength(1)
  })

  it('offers nothing for the Keeper asking about their own character', async () => {
    const keeper = await createUserRow({ status: 'ACTIVE' })
    const campaign = await createCampaignRow({ ownerId: keeper.id })

    const investigatorId = await createInvestigatorRow(keeper.id)

    expect(
      await listCampaignsToRequestFor({ investigatorId, keeperId: keeper.id, ownerId: keeper.id }),
    ).toEqual([])
    expect(campaign.id).toBeTruthy()
  })
})
