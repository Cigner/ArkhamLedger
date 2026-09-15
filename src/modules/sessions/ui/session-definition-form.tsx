'use client'

import { Check, TriangleAlert } from 'lucide-react'
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
 * same decisions and keeping two forms in step is a losing game — the first
 * version of this had no edit form at all, which meant a mistyped date could
 * only be fixed by cancelling the session.
 *
 * Editing while people are answering is allowed and has a consequence: moving
 * the dates or the hours discards every answer, because an answer describes the
 * question it was asked. The warning above the button says so with the number of
 * people it affects, before it happens rather than after.
 */
const MESSAGES: Record<string, string> = {
  'sessions.errors.windowEndsBeforeItStarts': 'The window ends before it begins.',
  'sessions.errors.windowTooWide': 'That search window is too wide. Ninety days is the maximum.',
  'sessions.errors.gridEndsBeforeItStarts': 'The evening ends before it starts.',
  'sessions.errors.gridTooShortForMinimum':
    'Those hours cannot contain a session of that minimum length.',
  'sessions.errors.definitionLocked':
    'This session has moved on and its dates can no longer be changed.',
  'sessions.errors.deadlineInThePast': 'That deadline has already passed.',
  'sessions.errors.deadlineAfterWindowStarts':
    'The deadline falls after the first date being searched.',
  'sessions.errors.quorumTooLow': 'A quorum has to be at least one.',
  'sessions.errors.quorumAboveParticipantCount':
    'That is more players than are invited, so no date could ever meet it.',
  'campaigns.errors.campaignArchived': 'This campaign is archived and cannot be changed.',
}

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
  const router = useRouter()
  const [{ today, windowEnd }] = useState(defaultWindow)
  const [navigating, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const editing = session !== undefined

  const create = useAction(createSession, {
    onSuccess: ({ data }) => {
      if (!data) return
      startTransition(() => {
        router.push(`/sessions/${data.sessionId}`)
        router.refresh()
      })
    },
    onError: ({ error: failure }) => setError(describe(failure, 'Could not create the session.')),
  })

  const update = useAction(updateSession, {
    onSuccess: () => {
      startTransition(() => {
        router.push(`/sessions/${session?.id}`)
        router.refresh()
      })
    },
    onError: ({ error: failure }) => setError(describe(failure, 'Could not save the session.')),
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
        <FieldLabel htmlFor="title">Title</FieldLabel>
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
        <FieldLabel htmlFor="description">What happens</FieldLabel>
        <Textarea
          id="description"
          name="description"
          disabled={busy}
          defaultValue={session?.description ?? ''}
        />
        <FieldDescription>Shown to everyone invited.</FieldDescription>
      </Field>

      <fieldset className="flex flex-col gap-3 border-t border-border-subtle pt-5">
        <legend className="sr-only">Search window</legend>
        <p className="font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-secondary">
          Which dates to search
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <DateField
            id="searchWindowStart"
            name="searchWindowStart"
            label="From"
            defaultValue={session?.searchWindowStart ?? today}
            required
            disabled={busy}
          />
          <DateField
            id="searchWindowEnd"
            name="searchWindowEnd"
            label="To"
            defaultValue={session?.searchWindowEnd ?? windowEnd}
            required
            disabled={busy}
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3 border-t border-border-subtle pt-5">
        <legend className="sr-only">Hours</legend>
        <p className="font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-secondary">
          Which hours to offer
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="gridStartHour">Earliest start</FieldLabel>
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
            <FieldLabel htmlFor="gridEndHour">Latest end</FieldLabel>
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
            <FieldLabel htmlFor="minSessionHours">Minimum hours</FieldLabel>
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
        <FieldNote>
          A session runs from its start to the end of the offered hours unless somebody&rsquo;s
          availability cuts it short. The minimum is the shortest run worth gathering for.
        </FieldNote>
      </fieldset>

      <fieldset className="flex flex-col gap-3 border-t border-border-subtle pt-5">
        <legend className="sr-only">Answering</legend>
        <p className="font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-secondary">
          Answering
        </p>

        <DateField
          id="availabilityDeadline"
          name="availabilityDeadline"
          label="Last day to answer"
          defaultValue={
            session?.availabilityDeadline
              ? deadlineToLocalDate(session.availabilityDeadline, session.timezone)
              : undefined
          }
          disabled={busy}
          description={`Optional. Answering closes when this day ends in ${session?.timezone ?? 'the campaign’s zone'}, and the dates are worked out on their own.`}
        />

        {editing ? (
          <Field>
            <FieldLabel htmlFor="quorum">Quorum</FieldLabel>
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
            <FieldDescription>
              How many players have to be free. The Keeper is not counted — they have to be there
              regardless.
            </FieldDescription>
          </Field>
        ) : null}
      </fieldset>

      {answersAtRisk ? (
        <p className="flex items-start gap-2 rounded-sm border border-status-warning/50 bg-candle-3 px-3 py-2 font-ui text-xs text-candle-11">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {respondentCount === 1 ? 'One person has' : `${respondentCount} people have`} already
            answered. Changing the dates or the hours clears every answer; changing anything else
            leaves them alone.
          </span>
        </p>
      ) : null}

      <FormError>{error}</FormError>

      <div className="flex items-center gap-2">
        <Button type="submit" variant="accent" disabled={busy}>
          <Check className="size-4" aria-hidden="true" />
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Create draft'}
        </Button>
      </div>
    </form>
  )
}

type ActionFailure = {
  serverError?: { messageKey?: string | undefined } | undefined
  validationErrors?: unknown
}

function describe(failure: ActionFailure, fallback: string): string {
  return resolveActionError(
    MESSAGES,
    fallback,
    failure.serverError?.messageKey,
    failure.validationErrors,
  )
}
