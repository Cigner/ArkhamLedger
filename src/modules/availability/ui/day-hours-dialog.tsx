'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/cn'
import { cellPresentation } from './grid-cell'
import type { SlotState } from '../domain/types'
import type { AvailabilityEditor } from './use-availability-editor'

/**
 * Everything about one evening, in one place.
 *
 * Hours belong to a date rather than to a separate mode, so this replaces the
 * whole-window grid: refining means opening the evening you want to refine.
 * It also scales — a month, or the ninety-day maximum, costs nothing here,
 * whereas a grid of that width squeezes its columns below the point of being
 * aimable.
 *
 * The state is three explicit choices rather than the cell's tap-to-cycle. The
 * cycle is the fast path and belongs on the cell; somebody who has opened this
 * wants to say something precise, and watching a colour change to find out what
 * they said is not precise.
 */
const STATE_CHOICES: readonly { value: SlotState; label: string; help: string }[] = [
  { value: 'YES', label: 'Free', help: 'Count me in.' },
  { value: 'IF_NEED_BE', label: 'At a push', help: 'Only if the date depends on it.' },
  { value: 'NO', label: 'Not free', help: 'I cannot make this evening.' },
]

export function DayHoursDialog({
  date,
  editor,
  gridStartHour,
  gridEndHour,
  minSessionHours,
  timezone,
  readOnly,
  onClose,
  onAnnounce,
}: {
  date: string | null
  editor: AvailabilityEditor
  gridStartHour: number
  gridEndHour: number
  minSessionHours: number
  timezone: string
  readOnly: boolean
  onClose: () => void
  onAnnounce: (message: string) => void
}) {
  if (date === null) return null

  const day = date
  const range = editor.rangeFor(day)
  const answered = range.state === 'YES' || range.state === 'IF_NEED_BE'

  const parsed = new Date(`${day}T12:00:00Z`)
  const label = parsed.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })

  const startOptions = Object.fromEntries(
    Array.from({ length: gridEndHour - gridStartHour }, (_, index) => {
      const hour = gridStartHour + index
      return [String(hour), `${String(hour).padStart(2, '0')}:00`]
    }),
  )

  const endOptions = Object.fromEntries(
    Array.from({ length: gridEndHour - gridStartHour }, (_, index) => {
      const hour = gridStartHour + index + 1
      return [String(hour), `${String(hour).padStart(2, '0')}:00`]
    }),
  )

  const tooShort = answered && range.toHour - range.fromHour < minSessionHours

  function choose(state: SlotState) {
    if (state === 'NO') {
      editor.setState(day, 'NO')
    } else {
      // Keep the hours already chosen; only the firmness changes.
      editor.setRangeWithState(day, state, range.fromHour || gridStartHour, range.toHour || gridEndHour)
    }
    onAnnounce(`${label}: ${cellPresentation(state).label}.`)
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>Times in {timezone}.</DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-5">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-secondary">
              Can you make this evening?
            </legend>

            <div className="flex flex-col gap-1.5">
              {STATE_CHOICES.map((choice) => {
                const selected = range.state === choice.value
                const presentation = cellPresentation(choice.value)

                return (
                  <button
                    key={choice.value}
                    type="button"
                    disabled={readOnly}
                    aria-pressed={selected}
                    onClick={() => choose(choice.value)}
                    className={cn(
                      'flex min-h-11 items-center gap-3 rounded-sm border px-3 py-2 text-left',
                      'transition-interactive disabled:cursor-default',
                      selected
                        ? cn('border-transparent', presentation.className)
                        : 'border-border-subtle bg-surface-subtle hover:border-border-default',
                    )}
                  >
                    <span aria-hidden="true" className="w-4 text-center text-sm">
                      {presentation.glyph}
                    </span>
                    <span className="flex flex-1 flex-col">
                      <span className="font-ui text-sm font-medium">{choice.label}</span>
                      <span className="font-ui text-xs opacity-80">{choice.help}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </fieldset>

          {answered ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-secondary">
                When, exactly
              </legend>

              <div className="flex flex-wrap items-center gap-2">
                <span className="font-ui text-sm text-text-secondary">from</span>
                <Select
                  items={startOptions}
                  value={String(range.fromHour)}
                  disabled={readOnly}
                  onValueChange={(value) => {
                    const from = Number(value)
                    editor.setRange(day, from, Math.max(range.toHour, from + 1))
                  }}
                >
                  <SelectTrigger className="h-11 w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(startOptions).map(([value, text]) => (
                      <SelectItem key={value} value={value}>
                        {text}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <span className="font-ui text-sm text-text-secondary">until</span>
                <Select
                  items={endOptions}
                  value={String(range.toHour)}
                  disabled={readOnly}
                  onValueChange={(value) => {
                    const to = Number(value)
                    editor.setRange(day, Math.min(range.fromHour, to - 1), to)
                  }}
                >
                  <SelectTrigger className="h-11 w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(endOptions).map(([value, text]) => (
                      <SelectItem key={value} value={value}>
                        {text}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {tooShort ? (
                <p className="font-ui text-xs text-status-warning">
                  That is shorter than the {minSessionHours} hours this session needs, so it
                  cannot run on this evening.
                </p>
              ) : (
                <p className="font-ui text-xs text-text-muted">
                  Leave these alone unless you start late or have to leave early.
                </p>
              )}
            </fieldset>
          ) : null}
        </DialogBody>

        <DialogFooter>
          {range.state !== null && !readOnly ? (
            <Button
              variant="ghost"
              onClick={() => {
                editor.clearDay(day)
                onAnnounce(`${label}: answer cleared.`)
              }}
            >
              Clear this evening
            </Button>
          ) : null}
          <Button variant="accent" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
