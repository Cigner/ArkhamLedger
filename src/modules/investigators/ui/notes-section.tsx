'use client'

import { Eye, Lock, NotebookPen, Users } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { useFormatter, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { resolveActionError } from '@/modules/identity/ui/action-errors'
import { FormError } from '@/modules/identity/ui/form-error'
import { reviseInvestigatorNote, writeInvestigatorNote } from '../actions/notes'
import type { NoteRecord } from '../data/notes'
import type { NoteKind, NoteVisibility } from '../domain/notes'

/**
 * What people have written about this character.
 *
 * Three kinds with visibly different reach, because getting that wrong is the
 * mistake this screen exists to prevent: a Keeper sharing something they meant
 * to keep, or a player believing their private read of somebody else's
 * character is private when it is not.
 *
 * Observations carry no visibility control at all rather than a disabled one.
 * An option greyed out still suggests it exists.
 */
const VISIBILITY_ICONS = {
  AUTHOR_ONLY: Lock,
  KEEPERS: Eye,
  KEEPERS_AND_OWNER: Eye,
  CAMPAIGN: Users,
} as const

export function NotesSection({
  investigatorId,
  campaignId,
  notes,
  viewerId,
  canWriteKeeperNote,
  canWriteOwnerNote,
}: {
  investigatorId: string
  campaignId: string | null
  notes: readonly NoteRecord[]
  viewerId: string
  canWriteKeeperNote: boolean
  canWriteOwnerNote: boolean
}) {
  const t = useTranslations('investigators.notes')
  const format = useFormatter()
  const router = useRouter()

  const kinds: NoteKind[] = [
    ...(canWriteKeeperNote ? (['KEEPER'] as const) : []),
    ...(canWriteOwnerNote ? (['OWNER_PRIVATE'] as const) : []),
    'PLAYER_OBSERVATION',
  ]

  const [kind, setKind] = useState<NoteKind>(kinds[0] ?? 'PLAYER_OBSERVATION')
  const [visibility, setVisibility] = useState<NoteVisibility>('KEEPERS')

  /*
   * Editing is a revision rather than a rewrite, so correcting a typo cannot
   * take back what somebody has already read. One note at a time, because the
   * only reason to open this is that a particular sentence is wrong.
   */
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)

  const write = useAction(writeInvestigatorNote, {
    onSuccess: () => {
      setContent('')
      setError(null)
      router.refresh()
    },
    onError: ({ error: actionError }) => {
      setError(
        resolveActionError(
          { 'investigators.errors.noteEmpty': t('errors.empty') },
          t('errors.failed'),
          actionError.serverError?.messageKey,
          actionError.validationErrors,
        ),
      )
    },
  })

  const revise = useAction(reviseInvestigatorNote, {
    onSuccess: () => {
      setError(null)
      setEditing(null)
      router.refresh()
    },
    onError: () => setError(t('errors.failed')),
  })

  const kindLabels: Record<NoteKind, string> = {
    KEEPER: t('kinds.KEEPER'),
    OWNER_PRIVATE: t('kinds.OWNER_PRIVATE'),
    PLAYER_OBSERVATION: t('kinds.PLAYER_OBSERVATION'),
  }

  const visibilityLabels: Record<NoteVisibility, string> = {
    AUTHOR_ONLY: t('visibility.AUTHOR_ONLY'),
    KEEPERS: t('visibility.KEEPERS'),
    KEEPERS_AND_OWNER: t('visibility.KEEPERS_AND_OWNER'),
    CAMPAIGN: t('visibility.CAMPAIGN'),
  }

  return (
    <div className="flex flex-col gap-6">
      <ul className="flex flex-col gap-3">
        {notes.length === 0 ? (
          <li className="font-ui text-sm text-text-muted">{t('empty')}</li>
        ) : null}

        {notes.map((note) => {
          const Icon = VISIBILITY_ICONS[note.visibility]
          const mine = note.authorId === viewerId

          return (
            <li key={note.id} className="flex flex-col gap-1 rounded-sm bg-surface-raised p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-muted">
                  {kindLabels[note.kind]}
                </span>
                <span className="flex items-center gap-1 font-ui text-xs text-text-muted">
                  <Icon className="size-3" aria-hidden="true" />
                  {visibilityLabels[note.visibility]}
                </span>
                <span className="ml-auto font-ui text-xs text-text-muted">
                  {note.authorName} ·{' '}
                  {format.dateTime(note.updatedAt, {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}
                  {note.revision > 1 ? ` · ${t('revision', { revision: note.revision })}` : ''}
                </span>
              </div>

              {editing === note.id ? (
                <div className="flex flex-col gap-2">
                  <Textarea
                    aria-label={t('content')}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    maxLength={4000}
                    rows={3}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={revise.isPending || draft.trim().length === 0}
                      onClick={() =>
                        revise.execute({
                          noteId: note.id,
                          content: draft,
                          visibility: note.visibility,
                        })
                      }
                    >
                      {t('saveEdit')}
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                      {t('cancelEdit')}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="whitespace-pre-line font-body text-sm text-text-primary">
                  {note.content}
                </p>
              )}

              {mine && editing !== note.id ? (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setEditing(note.id)
                      setDraft(note.content)
                    }}
                  >
                    {t('edit')}
                  </Button>
                </div>
              ) : null}

              {mine && note.kind === 'KEEPER' ? (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {(['KEEPERS', 'KEEPERS_AND_OWNER', 'CAMPAIGN'] as NoteVisibility[])
                    .filter((option) => option !== note.visibility)
                    .map((option) => (
                      <Button
                        key={option}
                        type="button"
                        variant="ghost"
                        disabled={revise.isPending}
                        onClick={() =>
                          revise.execute({
                            noteId: note.id,
                            content: note.content,
                            visibility: option,
                          })
                        }
                      >
                        {t('shareWith', { audience: visibilityLabels[option] })}
                      </Button>
                    ))}
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>

      <form
        className="flex flex-col gap-3 border-t border-border-subtle pt-4"
        onSubmit={(event) => {
          event.preventDefault()
          setError(null)
          write.execute({
            investigatorId,
            campaignId,
            kind,
            content,
            visibility: kind === 'KEEPER' ? visibility : 'AUTHOR_ONLY',
          })
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="note-kind">{t('kind')}</FieldLabel>
            <Select value={kind} onValueChange={(value) => setKind(String(value) as NoteKind)}>
              <SelectTrigger id="note-kind">
                <SelectValue placeholder={t('kind')}>
                  {(value: string) => kindLabels[value as NoteKind] ?? ''}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {kinds.map((option) => (
                  <SelectItem key={option} value={option}>
                    {kindLabels[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>{t(`hints.${kind}`)}</FieldDescription>
          </Field>

          {kind === 'KEEPER' ? (
            <Field>
              <FieldLabel htmlFor="note-visibility">{t('who')}</FieldLabel>
              <Select
                value={visibility}
                onValueChange={(value) => setVisibility(String(value) as NoteVisibility)}
              >
                <SelectTrigger id="note-visibility">
                  <SelectValue placeholder={t('who')}>
                    {(value: string) => visibilityLabels[value as NoteVisibility] ?? ''}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(['KEEPERS', 'KEEPERS_AND_OWNER', 'CAMPAIGN'] as NoteVisibility[]).map(
                    (option) => (
                      <SelectItem key={option} value={option}>
                        {visibilityLabels[option]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
        </div>

        <Field>
          <FieldLabel htmlFor="note-content">{t('content')}</FieldLabel>
          <Textarea
            id="note-content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            maxLength={4000}
            rows={3}
          />
        </Field>

        <FormError>{error}</FormError>

        <div>
          <Button
            type="submit"
            variant="outline"
            disabled={write.isPending || content.trim().length === 0}
          >
            <NotebookPen className="size-4" aria-hidden="true" />
            {write.isPending ? t('saving') : t('add')}
          </Button>
        </div>
      </form>
    </div>
  )
}
