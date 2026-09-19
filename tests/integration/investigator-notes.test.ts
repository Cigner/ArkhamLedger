import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  investigator,
  investigatorLineage,
  investigatorNoteRevision,
  investigatorProfile,
} from '@/db/schema'
import { newId } from '@/lib/ids'
import {
  addRevision,
  createNote,
  discloseRevision,
  findNote,
  listDisclosedRevisions,
  listNotes,
} from '@/modules/investigators/data/notes'
import { createUserRow, truncateAll } from './helpers/fixtures'

/**
 * Notes and their revisions.
 *
 * The promise: narrowing a note never takes back what somebody already read.
 * That only holds if an edit adds a revision rather than replacing one, and if
 * the capture happens against the revision being taken away rather than the one
 * replacing it.
 */
const NOW = new Date('2026-09-14T12:00:00.000Z')

async function createCharacter(ownerId: string) {
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
  await db.insert(investigatorProfile).values({ investigatorId, createdAt: NOW, updatedAt: NOW })

  return investigatorId
}

beforeEach(async () => {
  await truncateAll()
})

describe('revisions', () => {
  it('starts at one and reports the latest as current', async () => {
    const owner = await createUserRow({ status: 'ACTIVE', name: 'Eleanor' })
    const investigatorId = await createCharacter(owner.id)

    const noteId = await db.transaction((tx) =>
      createNote({
        investigatorId,
        campaignId: null,
        authorId: owner.id,
        kind: 'KEEPER',
        content: 'She is lying about the journal.',
        visibility: 'KEEPERS',
        now: NOW,
        executor: tx,
      }),
    )

    await db.transaction((tx) =>
      addRevision({
        noteId,
        content: 'She is lying about the journal, and about her brother.',
        visibility: 'KEEPERS_AND_OWNER',
        createdBy: owner.id,
        now: new Date(NOW.getTime() + 1000),
        executor: tx,
      }),
    )

    const [note] = await listNotes(investigatorId)
    expect(note?.revision).toBe(2)
    expect(note?.visibility).toBe('KEEPERS_AND_OWNER')
    expect(note?.content).toContain('her brother')
    expect(note?.authorName).toBe('Eleanor')
  })

  /*
   * An edit that overwrote the previous text would take back what somebody had
   * already read, which is the one thing this feature promises it will not do.
   */
  it('keeps every earlier revision', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const investigatorId = await createCharacter(owner.id)

    const noteId = await db.transaction((tx) =>
      createNote({
        investigatorId,
        campaignId: null,
        authorId: owner.id,
        kind: 'KEEPER',
        content: 'First',
        visibility: 'CAMPAIGN',
        now: NOW,
        executor: tx,
      }),
    )
    await db.transaction((tx) =>
      addRevision({
        noteId,
        content: 'Second',
        visibility: 'KEEPERS',
        createdBy: owner.id,
        now: new Date(NOW.getTime() + 1000),
        executor: tx,
      }),
    )

    const revisions = await db
      .select()
      .from(investigatorNoteRevision)
      .where(eq(investigatorNoteRevision.noteId, noteId))

    expect(revisions).toHaveLength(2)
    expect(revisions.map((revision) => revision.content).sort()).toEqual(['First', 'Second'])
  })
})

describe('disclosures', () => {
  it('leaves a former reader the revision they had', async () => {
    const keeper = await createUserRow({ status: 'ACTIVE' })
    const player = await createUserRow({ status: 'ACTIVE' })
    const investigatorId = await createCharacter(keeper.id)

    const noteId = await db.transaction((tx) =>
      createNote({
        investigatorId,
        campaignId: null,
        authorId: keeper.id,
        kind: 'KEEPER',
        content: 'Everyone should know she was at the docks.',
        visibility: 'CAMPAIGN',
        now: NOW,
        executor: tx,
      }),
    )

    const shared = await findNote(noteId)

    await db.transaction(async (tx) => {
      await discloseRevision({
        revisionId: shared.revisionId,
        viewerIds: [player.id],
        now: NOW,
        executor: tx,
      })
      await addRevision({
        noteId,
        content: 'Everyone should know she was at the docks.',
        visibility: 'KEEPERS',
        createdBy: keeper.id,
        now: new Date(NOW.getTime() + 1000),
        executor: tx,
      })
    })

    const kept = await listDisclosedRevisions({ investigatorId, viewerId: player.id })

    expect(kept).toHaveLength(1)
    expect(kept[0]?.content).toContain('at the docks')
    expect(kept[0]?.revision).toBe(1)

    // The note itself has moved on and is now Keepers-only.
    const [current] = await listNotes(investigatorId)
    expect(current?.visibility).toBe('KEEPERS')
  })

  it('records a repeat disclosure once', async () => {
    const keeper = await createUserRow({ status: 'ACTIVE' })
    const player = await createUserRow({ status: 'ACTIVE' })
    const investigatorId = await createCharacter(keeper.id)

    const noteId = await db.transaction((tx) =>
      createNote({
        investigatorId,
        campaignId: null,
        authorId: keeper.id,
        kind: 'KEEPER',
        content: 'Something',
        visibility: 'CAMPAIGN',
        now: NOW,
        executor: tx,
      }),
    )
    const note = await findNote(noteId)

    for (const attempt of [0, 1]) {
      await db.transaction((tx) =>
        discloseRevision({
          revisionId: note.revisionId,
          viewerIds: [player.id],
          now: new Date(NOW.getTime() + attempt * 1000),
          executor: tx,
        }),
      )
    }

    expect(await listDisclosedRevisions({ investigatorId, viewerId: player.id })).toHaveLength(1)
  })

  it('gives somebody who was never shown it nothing', async () => {
    const keeper = await createUserRow({ status: 'ACTIVE' })
    const stranger = await createUserRow({ status: 'ACTIVE' })
    const investigatorId = await createCharacter(keeper.id)

    await db.transaction((tx) =>
      createNote({
        investigatorId,
        campaignId: null,
        authorId: keeper.id,
        kind: 'KEEPER',
        content: 'Private',
        visibility: 'KEEPERS',
        now: NOW,
        executor: tx,
      }),
    )

    expect(await listDisclosedRevisions({ investigatorId, viewerId: stranger.id })).toEqual([])
  })
})
