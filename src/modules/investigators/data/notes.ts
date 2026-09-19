import 'server-only'
import { and, desc, eq, inArray, isNull, max } from 'drizzle-orm'
import { type DbOrTx, db } from '@/db/client'
import {
  authUser,
  investigatorNote,
  investigatorNoteDisclosure,
  investigatorNoteRevision,
} from '@/db/schema'
import { NotFoundError } from '@/lib/errors'
import { newId } from '@/lib/ids'
import type { NoteKind, NoteVisibility } from '../domain/notes'

/**
 * Notes and their revisions.
 *
 * A note is a thread rather than a value: every edit is a revision, and the
 * current one is simply the highest. That is what makes "previously disclosed
 * revisions remain available to their recipients" storable rather than a promise
 * somebody has to remember to keep.
 */
export type NoteRecord = {
  readonly id: string
  readonly investigatorId: string
  readonly campaignId: string | null
  readonly authorId: string
  readonly authorName: string
  readonly kind: NoteKind
  readonly revisionId: string
  readonly revision: number
  readonly content: string
  readonly visibility: NoteVisibility
  readonly updatedAt: Date
  /** The sheet this was written against, once the author has stopped seeing it live. */
  readonly disclosureSnapshotId: string | null
}

export async function createNote(input: {
  investigatorId: string
  campaignId: string | null
  authorId: string
  kind: NoteKind
  content: string
  visibility: NoteVisibility
  disclosureSnapshotId?: string | null
  now: Date
  executor: DbOrTx
}): Promise<string> {
  const noteId = newId()

  await input.executor.insert(investigatorNote).values({
    id: noteId,
    investigatorId: input.investigatorId,
    campaignId: input.campaignId,
    authorId: input.authorId,
    kind: input.kind,
    disclosureSnapshotId: input.disclosureSnapshotId ?? null,
    createdAt: input.now,
    updatedAt: input.now,
  })

  await input.executor.insert(investigatorNoteRevision).values({
    id: newId(),
    noteId,
    revision: 1,
    content: input.content,
    visibility: input.visibility,
    createdBy: input.authorId,
    createdAt: input.now,
  })

  return noteId
}

/**
 * Adds a revision.
 *
 * Never updates one. An edit that overwrote the previous text would take back
 * what somebody had already read, which is the one thing this feature promises
 * it will not do.
 */
export async function addRevision(input: {
  noteId: string
  content: string
  visibility: NoteVisibility
  createdBy: string
  now: Date
  executor: DbOrTx
}): Promise<{ revisionId: string; revision: number }> {
  const [current] = await input.executor
    .select({ highest: max(investigatorNoteRevision.revision) })
    .from(investigatorNoteRevision)
    .where(eq(investigatorNoteRevision.noteId, input.noteId))

  const revision = (current?.highest ?? 0) + 1
  const revisionId = newId()

  await input.executor.insert(investigatorNoteRevision).values({
    id: revisionId,
    noteId: input.noteId,
    revision,
    content: input.content,
    visibility: input.visibility,
    createdBy: input.createdBy,
    createdAt: input.now,
  })

  await input.executor
    .update(investigatorNote)
    .set({ updatedAt: input.now })
    .where(eq(investigatorNote.id, input.noteId))

  return { revisionId, revision }
}

/**
 * Records that somebody had been shown a revision.
 *
 * Written when a note narrows, for the people it narrows away from. The unique
 * index makes a repeat harmless, which matters because the capture runs inside
 * the same transaction as the change and may be retried with it.
 */
export async function discloseRevision(input: {
  revisionId: string
  viewerIds: readonly string[]
  now: Date
  executor: DbOrTx
}): Promise<number> {
  if (input.viewerIds.length === 0) return 0

  for (const viewerId of input.viewerIds) {
    await input.executor
      .insert(investigatorNoteDisclosure)
      .values({
        id: newId(),
        revisionId: input.revisionId,
        viewerId,
        disclosedAt: input.now,
      })
      .onDuplicateKeyUpdate({ set: { disclosedAt: input.now } })
  }

  return input.viewerIds.length
}

/** The current state of every note on a character. */
export async function listNotes(
  investigatorId: string,
  executor: DbOrTx = db,
): Promise<NoteRecord[]> {
  const notes = await executor
    .select({
      id: investigatorNote.id,
      investigatorId: investigatorNote.investigatorId,
      campaignId: investigatorNote.campaignId,
      authorId: investigatorNote.authorId,
      authorName: authUser.name,
      kind: investigatorNote.kind,
      disclosureSnapshotId: investigatorNote.disclosureSnapshotId,
      updatedAt: investigatorNote.updatedAt,
    })
    .from(investigatorNote)
    .innerJoin(authUser, eq(authUser.id, investigatorNote.authorId))
    .where(eq(investigatorNote.investigatorId, investigatorId))
    .orderBy(desc(investigatorNote.updatedAt))

  if (notes.length === 0) return []

  const revisions = await executor
    .select()
    .from(investigatorNoteRevision)
    .where(
      inArray(
        investigatorNoteRevision.noteId,
        notes.map((note) => note.id),
      ),
    )
    .orderBy(desc(investigatorNoteRevision.revision))

  return notes.flatMap((note) => {
    const latest = revisions.find((revision) => revision.noteId === note.id)
    if (!latest) return []

    return [
      {
        ...note,
        revisionId: latest.id,
        revision: latest.revision,
        content: latest.content,
        visibility: latest.visibility,
      },
    ]
  })
}

/**
 * Revisions a person keeps although the note has since narrowed.
 *
 * The other half of permanent access, for notes. A former recipient sees what
 * they were shown, frozen at the moment it stopped being shared with them.
 */
export async function listDisclosedRevisions(input: {
  investigatorId: string
  viewerId: string
  executor?: DbOrTx
}): Promise<
  {
    noteId: string
    kind: NoteKind
    authorName: string
    content: string
    revision: number
    disclosedAt: Date
  }[]
> {
  const executor = input.executor ?? db

  return executor
    .select({
      noteId: investigatorNote.id,
      kind: investigatorNote.kind,
      authorName: authUser.name,
      content: investigatorNoteRevision.content,
      revision: investigatorNoteRevision.revision,
      disclosedAt: investigatorNoteDisclosure.disclosedAt,
    })
    .from(investigatorNoteDisclosure)
    .innerJoin(
      investigatorNoteRevision,
      eq(investigatorNoteRevision.id, investigatorNoteDisclosure.revisionId),
    )
    .innerJoin(investigatorNote, eq(investigatorNote.id, investigatorNoteRevision.noteId))
    .innerJoin(authUser, eq(authUser.id, investigatorNote.authorId))
    .where(
      and(
        eq(investigatorNote.investigatorId, input.investigatorId),
        eq(investigatorNoteDisclosure.viewerId, input.viewerId),
      ),
    )
    .orderBy(desc(investigatorNoteDisclosure.disclosedAt))
}

export async function findNote(noteId: string, executor: DbOrTx = db): Promise<NoteRecord> {
  const [note] = await executor
    .select({ investigatorId: investigatorNote.investigatorId })
    .from(investigatorNote)
    .where(eq(investigatorNote.id, noteId))
    .limit(1)

  if (!note) throw new NotFoundError()

  const found = (await listNotes(note.investigatorId, executor)).find(
    (record) => record.id === noteId,
  )
  if (!found) throw new NotFoundError()

  return found
}

/**
 * Pins an author's observations to the sheet they were written about.
 *
 * Run when a disclosure is captured for somebody. Only the unpinned are
 * touched: a note should keep the first disclosure taken after it was written,
 * not be rewritten by every later one. "The latest disclosure available to the
 * author" is a fact about a moment, not a moving reference.
 */
export async function attachDisclosureToObservations(input: {
  investigatorId: string
  authorId: string
  disclosureSnapshotId: string
  executor: DbOrTx
}): Promise<number> {
  const [result] = await input.executor
    .update(investigatorNote)
    .set({ disclosureSnapshotId: input.disclosureSnapshotId })
    .where(
      and(
        eq(investigatorNote.investigatorId, input.investigatorId),
        eq(investigatorNote.authorId, input.authorId),
        eq(investigatorNote.kind, 'PLAYER_OBSERVATION'),
        isNull(investigatorNote.disclosureSnapshotId),
      ),
    )

  return result.affectedRows
}

/**
 * One person's own observations about one character.
 *
 * Read on the kept-disclosure page, where the live sheet is out of reach and
 * the guard that protects it would refuse the reader for the very reason they
 * are there. Author-only notes need no further authorization than being the
 * author, which is the whole of the filter.
 */
export async function listOwnObservations(input: {
  investigatorId: string
  authorId: string
  executor?: DbOrTx
}): Promise<{ id: string; content: string; revision: number; updatedAt: Date }[]> {
  const executor = input.executor ?? db

  const notes = await executor
    .select({ id: investigatorNote.id, updatedAt: investigatorNote.updatedAt })
    .from(investigatorNote)
    .where(
      and(
        eq(investigatorNote.investigatorId, input.investigatorId),
        eq(investigatorNote.authorId, input.authorId),
        eq(investigatorNote.kind, 'PLAYER_OBSERVATION'),
      ),
    )
    .orderBy(desc(investigatorNote.updatedAt))

  if (notes.length === 0) return []

  const revisions = await executor
    .select()
    .from(investigatorNoteRevision)
    .where(
      inArray(
        investigatorNoteRevision.noteId,
        notes.map((note) => note.id),
      ),
    )
    .orderBy(desc(investigatorNoteRevision.revision))

  return notes.flatMap((note) => {
    const latest = revisions.find((revision) => revision.noteId === note.id)
    if (!latest) return []

    return [
      {
        id: note.id,
        content: latest.content,
        revision: latest.revision,
        updatedAt: note.updatedAt,
      },
    ]
  })
}
