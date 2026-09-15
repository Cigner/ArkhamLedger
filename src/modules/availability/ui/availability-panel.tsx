'use client'

import { Check, Clock3, Globe, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { Button } from '@/components/ui/button'
import { useMediaQuery } from '@/lib/hooks/use-media-query'
import { resolveActionError } from '@/modules/identity/ui/action-errors'
import { FormError } from '@/modules/identity/ui/form-error'
import { saveAvailability, suggestPreviousAnswer } from '../actions/availability'
import { formatDeadline } from '@/lib/datetime/format'
import { rangeIsLongEnough } from '../domain/ranges'
import type { AvailabilityView } from '../domain/types'
import { AvailabilityLegend } from './availability-legend'
import { DayHoursDialog } from './day-hours-dialog'
import { DayOverview } from './day-overview'
import { PRESETS } from './presets'
import { useAvailabilityEditor } from './use-availability-editor'
import { WindowSummaryList } from './window-summary'

/**
 * The whole answering experience.
 *
 * Deliberately not autosaving. Availability is a considered answer rather than a
 * stream of edits, and a save the user pressed is a save they know happened —
 * which matters when the alternative is discovering on the night that their
 * answer never arrived.
 */
const MESSAGES: Record<string, string> = {
  'availability.errors.deadlinePassed':
    'The deadline has passed, so answers are closed. Ask the Keeper to reopen it.',
  'availability.errors.notInvited': 'You are not on the list for this session.',
  'sessions.errors.notCollecting': 'This session is not asking for availability at the moment.',
}

/**
 * Why the calendar is read-only.
 *
 * A session nobody has been asked about yet and one whose answers have closed
 * are opposite situations, and both used to say "answers are closed" — which
 * reads as a fault to the Keeper who has just created the thing.
 */
function closedReason(status: AvailabilityView['status']): string {
  switch (status) {
    case 'DRAFT':
      return 'Nobody has been asked yet. The Keeper opens this when the session is ready.'
    case 'PROPOSED':
      return 'Answers are closed. The Keeper is choosing between the dates that work.'
    case 'SCHEDULED':
      return 'The date is settled, so answers are closed.'
    case 'COMPLETED':
      return 'This session has been played.'
    case 'CANCELLED':
      return 'This session was cancelled.'
    case 'COLLECTING':
      return 'Answers are open.'
  }
}

export function AvailabilityPanel({ view }: { view: AvailabilityView }) {
  const router = useRouter()
  const narrow = useMediaQuery('(max-width: 767px)')

  const editor = useAvailabilityEditor({
    initial: view.own,
    dates: view.dates,
    gridStartHour: view.gridStartHour,
    gridEndHour: view.gridEndHour,
  })

  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [suggestion, setSuggestion] = useState<{ title: string } | null>(null)

  /*
   * Evenings first, hours on request.
   *
   * Nearly every answer is "yes that evening" or "no that evening"; making
   * people aim at an hour to say so turns the common case into the fiddly one.
   * The few who start late or leave early open the one evening that differs,
   * which is also why there is no hours mode spanning the whole window: at a
   * month of dates such a grid has nothing aimable left to offer.
   */
  const [openDay, setOpenDay] = useState<string | null>(null)

  const save = useAction(saveAvailability, {
    onSuccess: ({ data }) => {
      setSavedAt(data?.savedAt ?? new Date())
      editor.markSaved()
      setAnnouncement('Your answer has been saved.')
      router.refresh()
    },
    onError: ({ error: actionError }) => {
      setError(
        resolveActionError(
          MESSAGES,
          'Could not save your answer.',
          actionError.serverError?.messageKey,
          actionError.validationErrors,
        ),
      )
    },
  })

  // Looks up the previous answer but never applies it: the button does that.
  const suggest = useAction(suggestPreviousAnswer)

  /*
   * Looked up once on mount so the offer can name the session it came from.
   * Nothing is applied until the player asks for it — "the same as last time" is
   * an assumption, not an answer.
   */
  useEffect(() => {
    if (view.editable) suggest.execute({ sessionId: view.sessionId })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.sessionId, view.editable])

  const handleSave = useCallback(() => {
    setError(null)
    save.execute({ sessionId: view.sessionId, ranges: editor.toArray() })
  }, [editor, save, view.sessionId])

  const tooShort = editor
    .toArray()
    .filter((range) => !rangeIsLongEnough(range, view.minSessionHours))

  const deadlineLabel = view.deadline ? formatDeadline(view.deadline, view.timezone) : null

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="flex items-center gap-1.5 font-ui text-sm text-text-secondary">
          <Globe className="size-4 text-text-muted" aria-hidden="true" />
          <strong className="font-medium text-text-primary">{view.timezone}</strong>
        </p>
        {deadlineLabel ? (
          <p className="flex items-center gap-1.5 font-ui text-sm text-text-secondary">
            <Clock3 className="size-4 text-text-muted" aria-hidden="true" />
            Answer by <time>{deadlineLabel}</time>
          </p>
        ) : null}
      </div>

      {view.editable ? (
        <div className="flex flex-col gap-3">
          <p className="font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-secondary">
            Answer quickly
          </p>
          <div className="flex flex-wrap gap-2">
            {suggest.result.data?.found ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const data = suggest.result.data
                  if (!data?.found) return
                  editor.useSuggestion(data.byWeekday)
                  setSuggestion({ title: data.sessionTitle })
                  setAnnouncement(`Filled in from ${data.sessionTitle}. Check it before saving.`)
                }}
              >
                Same as last time
              </Button>
            ) : null}
            {PRESETS.map((preset) => (
              <Button
                key={preset.id}
                variant="outline"
                size="sm"
                title={preset.description}
                onClick={() => {
                  editor.usePreset(preset.id)
                  setAnnouncement(`${preset.label} applied. ${preset.description}`)
                }}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          {suggestion ? (
            <p className="font-ui text-xs text-text-muted">
              Filled in from {suggestion.title}. Check it before saving.
            </p>
          ) : null}
        </div>
      ) : null}

      <AvailabilityLegend />

      <p className="font-ui text-xs text-text-muted">
        Pick an evening to answer it. Pick it again to change how firm that is. Open the clock on an
        evening you start late or have to leave early.
      </p>

      <DayOverview
        editor={editor}
        dates={view.dates}
        gridStartHour={view.gridStartHour}
        gridEndHour={view.gridEndHour}
        minSessionHours={view.minSessionHours}
        layout={narrow ? 'list' : 'calendar'}
        readOnly={!view.editable}
        timezone={view.timezone}
        onOpenHours={setOpenDay}
        onAnnounce={setAnnouncement}
      />

      <DayHoursDialog
        date={openDay}
        editor={editor}
        gridStartHour={view.gridStartHour}
        gridEndHour={view.gridEndHour}
        minSessionHours={view.minSessionHours}
        timezone={view.timezone}
        readOnly={!view.editable}
        onClose={() => setOpenDay(null)}
        onAnnounce={setAnnouncement}
      />

      {/*
        Announces finished edits rather than every keystroke inside the dialog,
        which would be a stream nobody can follow.
      */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {tooShort.length > 0 ? (
        <p className="rounded-sm border border-status-warning/50 bg-candle-3 px-3 py-2 font-ui text-xs text-candle-11">
          {tooShort.length === 1 ? 'One evening is' : `${tooShort.length} evenings are`} marked for
          less than {view.minSessionHours} hours, so this session could not run then. They are
          outlined below.
        </p>
      ) : null}

      <FormError>{error}</FormError>

      {view.editable ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="accent"
            disabled={save.isPending || !editor.isDirty}
            onClick={handleSave}
          >
            <Check className="size-4" aria-hidden="true" />
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>

          {editor.isDirty ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => editor.reset()}
              disabled={save.isPending}
            >
              <Undo2 className="size-4" aria-hidden="true" />
              Undo
            </Button>
          ) : null}

          <span role="status" className="font-ui text-xs text-text-muted">
            {editor.isDirty
              ? 'Not saved yet.'
              : savedAt
                ? 'Saved.'
                : view.own.some((range) => range.state !== null)
                  ? 'Your answer is recorded.'
                  : 'You have not answered yet.'}
          </span>
        </div>
      ) : (
        <p className="font-ui text-sm text-text-muted">{closedReason(view.status)}</p>
      )}

      <section className="flex flex-col gap-3 border-t border-border-subtle pt-6">
        <h2 className="font-display text-base tracking-[--tracking-display] text-text-primary">
          When the group could play
        </h2>
        <p className="font-ui text-xs text-text-muted">
          {view.respondentCount} of {view.participantCount} answered. Who said what stays between
          each player and the Keeper.
        </p>
        <WindowSummaryList windows={view.windows} timezone={view.timezone} />
      </section>
    </div>
  )
}
