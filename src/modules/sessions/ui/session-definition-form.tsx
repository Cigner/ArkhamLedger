'use client'

import { Check, TriangleAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel, FieldNote } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { DateField } from '@/components/patterns/date-field'
import { deadlineToLocalDate } from '@/lib/datetime/format'
import { readString } from '@/lib/form-data'
import { resolveActionError } from '@/modules/identity/ui/action-errors'
import { FormError } from '@/modules/identity/ui/form-error'
import { createSession, updateSession } from '../actions/session'
import {
  DEFAULT_GRID_END_HOUR,
  DEFAULT_GRID_START_HOUR,
  DEFAULT_MIN_SESSION_HOURS,
} from '../domain/constants'
import type { SessionDetail } from '../domain/types'

/**
 * What a session is asking, on one form.
 *
 * The same fields create a draft and edit one afterwards, because they are the
 * same decisions and keeping two forms in step is a losing game - the first
 * version of this had no edit form at all, which meant a mistyped date could
 * only be fixed by cancelling the session.
 *
 * Editing while people are answering is allowed and has a consequence: moving
 * the dates or the hours discards every answer, because an answer describes the
 * question it was asked. The warning above the button says so with the number of
 * people it affects, before it happens rather than after.
 */
const DEFAULT_WINDOW_DAYS = 30

/**
 * Default window: today through a month out.
 *
 * A fortnight regularly contains no evening the whole group can make, and a
 * Keeper who has to widen it discovers that only after everybody has answered.
 * Computed in a lazy initializer rather than in the render body, which reads the
 * clock and would make the component impure.
 */
function defaultWindow(): { today: string; windowEnd: string } {
  const now = Date.now()
  return {
    today: new Date(now).toISOString().slice(0, 10),
    windowEnd: new Date(now + DEFAULT_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10),
  }
}

export function SessionDefinitionForm({
  campaignId,
  session,
  respondentCount = 0,
}: {
  campaignId: string
  /** Absent when creating. */
  session?: SessionDetail
  /** How many people have already answered, for the warning. */
  respondentCount?: number
}) {
  const t = useTranslations('sessions.definition')
  const router = useRouter()
  const [{ today, windowEnd }] = useState(defaultWindow)
  const [navigating, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const messages: Record<string, string> = {
    'sessions.errors.windowEndsBeforeItStarts': t('errors.windowEndsBeforeStart'),
    'sessions.errors.windowTooWide': t('errors.windowTooWide'),
    'sessions.errors.gridEndsBeforeItStarts': t('errors.gridEndsBeforeStart'),
    'sessions.errors.gridTooShortForMinimum': t('errors.gridTooShort'),
    'sessions.errors.definitionLocked': t('errors.definitionLocked'),
    'sessions.errors.deadlineInThePast': t('errors.deadlineInPast'),
    'sessions.errors.deadlineAfterWindowStarts': t('errors.deadlineAfterStart'),
    'sessions.errors.quorumTooLow': t('errors.quorumTooLow'),
    'sessions.errors.quorumAboveParticipantCount': t('errors.quorumTooHigh'),
    'campaigns.errors.campaignArchived': t('errors.campaignArchived'),
  }

  const editing = session !== undefined

  const create = useAction(createSession, {
    onSuccess: ({ data }) => {
      if (!data) return
      startTransition(() => {
        router.push(`/sessions/${data.sessionId}`)
        router.refresh()
      })
    },
    onError: ({ error: failure }) =>
      setError(describe(failure, messages, t('errors.createFailed'))),
  })

  const update = useAction(updateSession, {
    onSuccess: () => {
      startTransition(() => {
        router.push(`/sessions/${session?.id}`)
        router.refresh()
      })
    },
    onError: ({ error: failure }) => setError(describe(failure, messages, t('errors.saveFailed'))),
  })

  const busy = create.isPending || update.isPending || navigating

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const form = new FormData(event.currentTarget)
    const shared = {
      title: readString(form, 'title'),
      description: readString(form, 'description') || undefined,
      searchWindowStart: readString(form, 'searchWindowStart'),
      searchWindowEnd: readString(form, 'searchWindowEnd'),
      gridStartHour: Number(readString(form, 'gridStartHour')),
      gridEndHour: Number(readString(form, 'gridEndHour')),
      minSessionHours: Number(readString(form, 'minSessionHours')),
      availabilityDeadline: readString(form, 'availabilityDeadline') || undefined,
    }

    if (session) {
      update.execute({
        ...shared,
        sessionId: session.id,
        quorum: Number(readString(form, 'quorum')),
      })
      return
    }

    create.execute({ ...shared, campaignId })
  }

  const answersAtRisk = editing && session.status === 'COLLECTING' && respondentCount > 0

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-5" noValidate>
      <Field>
        <FieldLabel htmlFor="title">{t('title')}</FieldLabel>
        <Input
          id="title"
          name="title"
          required
          autoFocus
          disabled={busy}
          defaultValue={session?.title}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="description">{t('description')}</FieldLabel>
        <Textarea
          id="description"
          name="description"
          disabled={busy}
          defaultValue={session?.description ?? ''}
        />
        <FieldDescription>{t('descriptionHint')}</FieldDescription>
      </Field>

      <fieldset className="flex flex-col gap-3 border-t border-border-subtle pt-5">
        <legend className="sr-only">{t('searchWindow')}</legend>
        <p className="font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-secondary">
          {t('searchDates')}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <DateField
            id="searchWindowStart"
            name="searchWindowStart"
            label={t('from')}
            defaultValue={session?.searchWindowStart ?? today}
            required
            disabled={busy}
          />
          <DateField
            id="searchWindowEnd"
            name="searchWindowEnd"
            label={t('to')}
            defaultValue={session?.searchWindowEnd ?? windowEnd}
            required
            disabled={busy}
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3 border-t border-border-subtle pt-5">
        <legend className="sr-only">{t('hours')}</legend>
        <p className="font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-secondary">
          {t('offerHours')}
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="gridStartHour">{t('earliestStart')}</FieldLabel>
            <Input
              id="gridStartHour"
              name="gridStartHour"
              type="number"
              min={0}
              max={23}
              defaultValue={session?.gridStartHour ?? DEFAULT_GRID_START_HOUR}
              required
              disabled={busy}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="gridEndHour">{t('latestEnd')}</FieldLabel>
            <Input
              id="gridEndHour"
              name="gridEndHour"
              type="number"
              min={1}
              max={24}
              defaultValue={session?.gridEndHour ?? DEFAULT_GRID_END_HOUR}
              required
              disabled={busy}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="minSessionHours">{t('minimumHours')}</FieldLabel>
            <Input
              id="minSessionHours"
              name="minSessionHours"
              type="number"
              min={1}
              max={24}
              defaultValue={session?.minSessionHours ?? DEFAULT_MIN_SESSION_HOURS}
              required
              disabled={busy}
            />
          </Field>
        </div>
        <FieldNote>{t('hoursHint')}</FieldNote>
      </fieldset>

      <fieldset className="flex flex-col gap-3 border-t border-border-subtle pt-5">
        <legend className="sr-only">{t('answering')}</legend>
        <p className="font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-secondary">
          {t('answering')}
        </p>

        <DateField
          id="availabilityDeadline"
          name="availabilityDeadline"
          label={t('deadline')}
          defaultValue={
            session?.availabilityDeadline
              ? deadlineToLocalDate(session.availabilityDeadline, session.timezone)
              : undefined
          }
          disabled={busy}
          description={t('deadlineHint', {
            timezone: session?.timezone ?? t('campaignTimezone'),
          })}
        />

        {editing ? (
          <Field>
            <FieldLabel htmlFor="quorum">{t('quorum')}</FieldLabel>
            <Input
              id="quorum"
              name="quorum"
              type="number"
              min={1}
              max={64}
              defaultValue={session.quorum}
              required
              disabled={busy}
            />
            <FieldDescription>{t('quorumHint')}</FieldDescription>
          </Field>
        ) : null}
      </fieldset>

      {answersAtRisk ? (
        <p className="flex items-start gap-2 rounded-sm border border-status-warning/50 bg-candle-3 px-3 py-2 font-ui text-xs text-candle-11">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{t('answersAtRisk', { count: respondentCount })}</span>
        </p>
      ) : null}

      <FormError>{error}</FormError>

      <div className="flex items-center gap-2">
        <Button type="submit" variant="accent" disabled={busy}>
          <Check className="size-4" aria-hidden="true" />
          {busy ? t('saving') : editing ? t('saveChanges') : t('createDraft')}
        </Button>
      </div>
    </form>
  )
}

type ActionFailure = {
  serverError?: { messageKey?: string | undefined } | undefined
  validationErrors?: unknown
}

function describe(
  failure: ActionFailure,
  messages: Record<string, string>,
  fallback: string,
): string {
  return resolveActionError(
    messages,
    fallback,
    failure.serverError?.messageKey,
    failure.validationErrors,
  )
}
