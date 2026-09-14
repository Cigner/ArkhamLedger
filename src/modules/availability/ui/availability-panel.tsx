'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { Button } from '@/components/ui/button'
import { useMediaQuery } from '@/lib/hooks/use-media-query'
import { resolveActionError } from '@/modules/identity/ui/action-errors'
import { FormError } from '@/modules/identity/ui/form-error'
import { saveAvailability, suggestPreviousAnswer } from '../actions/availability'
import { rangeIsLongEnough } from '../domain/ranges'
import type { AvailabilityView } from '../domain/types'
import { AvailabilityGrid } from './availability-grid'
import { AvailabilityLegend } from './availability-legend'
import { DayOverview } from './day-overview'
import { HourRefinementList } from './hour-refinement'
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
   * Anybody who genuinely starts late or leaves early switches deliberately, and
   * the day view then shows what they chose rather than hiding it.
   */
  const [showHours, setShowHours] = useState(false)

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

  const deadlineLabel = view.deadline
    ? view.deadline.toLocaleString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: view.timezone,
      })
    : null

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="font-ui text-sm text-text-secondary">
          Times shown in <strong className="text-text-primary">{view.timezone}</strong>
        </p>
        {deadlineLabel ? (
          <p className="font-ui text-sm text-text-secondary">
            Answers close <time>{deadlineLabel}</time>
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
                  setAnnouncement(
                    `Filled in from ${data.sessionTitle}. Check it before saving.`,
                  )
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <AvailabilityLegend />
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={showHours}
          onClick={() => {
            setShowHours((current) => !current)
            setAnnouncement(
              showHours ? 'Showing whole evenings.' : 'Showing exact hours.',
            )
          }}
        >
          {showHours ? 'Back to whole evenings' : 'Set exact hours'}
        </Button>
      </div>

      <p className="font-ui text-xs text-text-muted">
        {showHours
          ? narrow
            ? 'Set when each evening starts and ends.'
            : 'Click an hour to be free from then until the end. Drag to finish earlier.'
          : 'Tap an evening to answer it. Tap again to change how firm that is. Only open the hours if you start late or have to leave early.'}
      </p>

      {showHours && narrow ? (
        <HourRefinementList
          editor={editor}
          dates={view.dates}
          gridStartHour={view.gridStartHour}
          gridEndHour={view.gridEndHour}
          minSessionHours={view.minSessionHours}
          readOnly={!view.editable}
          timezone={view.timezone}
          onAnnounce={setAnnouncement}
        />
      ) : showHours ? (
        <div className="overflow-x-auto">
          <AvailabilityGrid
            editor={editor}
            dates={view.dates}
            gridStartHour={view.gridStartHour}
            gridEndHour={view.gridEndHour}
            minSessionHours={view.minSessionHours}
            orientation={narrow ? 'hours-across' : 'hours-down'}
            readOnly={!view.editable}
            timezone={view.timezone}
            onAnnounce={setAnnouncement}
          />
        </div>
      ) : (
        <DayOverview
          editor={editor}
          dates={view.dates}
          gridStartHour={view.gridStartHour}
          gridEndHour={view.gridEndHour}
          minSessionHours={view.minSessionHours}
          readOnly={!view.editable}
          timezone={view.timezone}
          onAnnounce={setAnnouncement}
        />
      )}

      {/*
        Announces finished edits, never individual cells: a running commentary
        during a drag is a stream nobody can follow.
      */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {tooShort.length > 0 ? (
        <p className="rounded-sm border border-status-warning/50 bg-candle-3 px-3 py-2 font-ui text-xs text-candle-11">
          {tooShort.length === 1 ? 'One evening is' : `${tooShort.length} evenings are`} marked for
          less than {view.minSessionHours} hours, so this session could not run then. They are
          outlined in the grid.
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
            {save.isPending ? 'Saving…' : 'Save my answer'}
          </Button>

          {editor.isDirty ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => editor.reset()}
              disabled={save.isPending}
            >
              Undo changes
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
        <p className="font-ui text-sm text-text-muted">
          Answers are closed for this session.
        </p>
      )}

      <section className="flex flex-col gap-3 border-t border-border-subtle pt-6">
        <h3 className="font-display text-base tracking-[--tracking-display] text-text-primary">
          When the group could play
        </h3>
        <p className="font-ui text-xs text-text-muted">
          {view.respondentCount} of {view.participantCount} have answered. Who said what stays
          between each player and the Keeper.
        </p>
        <WindowSummaryList windows={view.windows} timezone={view.timezone} />
      </section>
    </div>
  )
}
