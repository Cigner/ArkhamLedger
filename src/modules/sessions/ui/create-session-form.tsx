'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { readString } from '@/lib/form-data'
import { resolveActionError } from '@/modules/identity/ui/action-errors'
import { FormError } from '@/modules/identity/ui/form-error'
import { createSession } from '../actions/session'
import {
  DEFAULT_GRID_END_HOUR,
  DEFAULT_GRID_START_HOUR,
  DEFAULT_MIN_SESSION_HOURS,
} from '../domain/constants'

/**
 * Creates a session as a draft.
 *
 * Everyone in the campaign is invited by default and the Keeper narrows it
 * afterwards, because the common case is "the whole group" and starting from an
 * empty roster would make that the long way round.
 */
const MESSAGES: Record<string, string> = {
  'sessions.errors.windowEndsBeforeItStarts': 'The window ends before it begins.',
  'sessions.errors.windowTooWide': 'That search window is too wide. Ninety days is the maximum.',
  'sessions.errors.gridEndsBeforeItStarts': 'The evening ends before it starts.',
  'sessions.errors.gridTooShortForMinimum':
    'Those hours cannot contain a session of that minimum length.',
  'campaigns.errors.campaignArchived': 'This campaign is archived and cannot be changed.',
}

/**
 * Default window: today through a fortnight out.
 *
 * Computed once in a lazy initializer rather than in the render body, which
 * reads the clock and would make the component impure.
 */
function defaultWindow(): { today: string; inTwoWeeks: string } {
  const now = Date.now()
  return {
    today: new Date(now).toISOString().slice(0, 10),
    inTwoWeeks: new Date(now + 14 * 86_400_000).toISOString().slice(0, 10),
  }
}

export function CreateSessionForm({ campaignId }: { campaignId: string }) {
  const router = useRouter()
  const [{ today, inTwoWeeks }] = useState(defaultWindow)
  const [navigating, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const { execute, isPending } = useAction(createSession, {
    onSuccess: ({ data }) => {
      if (!data) return
      startTransition(() => {
        router.push(`/sessions/${data.sessionId}`)
        router.refresh()
      })
    },
    onError: ({ error: actionError }) => {
      setError(
        resolveActionError(
          MESSAGES,
          'Could not create the session.',
          actionError.serverError?.messageKey,
          actionError.validationErrors,
        ),
      )
    },
  })

  const busy = isPending || navigating

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const form = new FormData(event.currentTarget)
    execute({
      campaignId,
      title: readString(form, 'title'),
      description: readString(form, 'description') || undefined,
      searchWindowStart: readString(form, 'searchWindowStart'),
      searchWindowEnd: readString(form, 'searchWindowEnd'),
      gridStartHour: Number(readString(form, 'gridStartHour')),
      gridEndHour: Number(readString(form, 'gridEndHour')),
      minSessionHours: Number(readString(form, 'minSessionHours')),
    })
  }


  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex max-w-xl flex-col gap-5" noValidate>
      <Field>
        <FieldLabel htmlFor="title">Title</FieldLabel>
        <Input id="title" name="title" required autoFocus disabled={busy} />
      </Field>

      <Field>
        <FieldLabel htmlFor="description">What happens</FieldLabel>
        <Textarea id="description" name="description" disabled={busy} />
        <FieldDescription>Shown to everyone invited.</FieldDescription>
      </Field>

      <fieldset className="flex flex-col gap-3 border-t border-border-subtle pt-5">
        <legend className="sr-only">Search window</legend>
        <p className="font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-secondary">
          Which dates to search
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="searchWindowStart">From</FieldLabel>
            <Input
              id="searchWindowStart"
              name="searchWindowStart"
              type="date"
              defaultValue={today}
              required
              disabled={busy}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="searchWindowEnd">To</FieldLabel>
            <Input
              id="searchWindowEnd"
              name="searchWindowEnd"
              type="date"
              defaultValue={inTwoWeeks}
              required
              disabled={busy}
            />
          </Field>
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
              defaultValue={DEFAULT_GRID_START_HOUR}
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
              defaultValue={DEFAULT_GRID_END_HOUR}
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
              defaultValue={DEFAULT_MIN_SESSION_HOURS}
              required
              disabled={busy}
            />
          </Field>
        </div>
        <FieldDescription>
          A session runs from its start to the end of the offered hours unless somebody&rsquo;s
          availability cuts it short. The minimum is the shortest run worth gathering for.
        </FieldDescription>
      </fieldset>

      <FormError>{error}</FormError>

      <div className="flex items-center gap-2">
        <Button type="submit" variant="accent" disabled={busy}>
          {busy ? 'Creating…' : 'Create draft'}
        </Button>
        <Button
          variant="ghost"
          onClick={() => router.push(`/campaigns/${campaignId}/sessions`)}
          disabled={busy}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
