'use client'

import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/cn'
import { cellPresentation } from './grid-cell'
import type { AvailabilityView, SlotTally } from '../domain/types'

/**
 * The Keeper's reading of the answers.
 *
 * Three questions, three tabs: how the evenings compare, what each person said,
 * and who has not replied. The last is the one that actually moves a session
 * forward, which is why it is not buried.
 *
 * This is the only place names sit beside answers, and it is reached only
 * through a query that authorizes for it.
 */
export function KeeperAvailability({ view }: { view: AvailabilityView }) {
  const hours = Array.from(
    { length: view.gridEndHour - view.gridStartHour },
    (_, index) => view.gridStartHour + index,
  )

  const talliesByKey = new Map(
    view.tallies.map((tally) => [`${tally.localDate}:${tally.localHour}`, tally]),
  )

  const pending = view.participants.filter((participant) => participant.respondedAt === null)
  const answered = view.participants.filter((participant) => participant.respondedAt !== null)

  return (
    <Tabs defaultValue="heatmap">
      <TabsList>
        <TabsTrigger value="heatmap">How the evenings compare</TabsTrigger>
        <TabsTrigger value="people">What each person said</TabsTrigger>
        <TabsTrigger value="pending">Who has not replied</TabsTrigger>
      </TabsList>

      <TabsContent value="heatmap" className="pt-5">
        <div className="overflow-x-auto">
          <div
            /*
             * Both columns are fixed rather than fractional. `auto` on the first
             * one collapsed to twelve pixels as soon as the dates overflowed -
             * the names were still there, truncated to nothing - and a date
             * column narrower than this clips "Wed 21".
             */
            className="grid gap-1"
            style={{
              gridTemplateColumns: `3rem repeat(${view.dates.length}, 3rem)`,
            }}
          >
            <div />
            {view.dates.map((date) => (
              <div key={date} className="pb-1 text-center font-ui text-2xs text-text-muted">
                {new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
                  weekday: 'short',
                  day: 'numeric',
                  timeZone: 'UTC',
                })}
              </div>
            ))}

            {hours.map((hour) => (
              <div key={hour} className="contents">
                <div
                  data-tabular
                  className="pr-2 text-right font-ui text-2xs leading-8 text-text-muted"
                >
                  {String(hour).padStart(2, '0')}:00
                </div>
                {view.dates.map((date) => {
                  const tally = talliesByKey.get(`${date}:${hour}`)
                  const free = (tally?.yes ?? 0) + (tally?.ifNeedBe ?? 0)
                  const step = intensityStep(free, view.participantCount)

                  return (
                    <div
                      key={`${date}:${hour}`}
                      data-tabular
                      title={`${free} of ${view.participantCount} free`}
                      className="flex h-8 items-center justify-center rounded-sm border border-border-subtle font-ui text-2xs text-text-primary"
                      style={{ background: step ? `var(--color-avail-${step})` : undefined }}
                    >
                      {/* The number is always printed: colour alone is not the encoding. */}
                      {free > 0 ? free : ''}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </TabsContent>

      <TabsContent value="people" className="pt-5">
        <div className="overflow-x-auto">
          <div
            // Names need room, and at thirty columns they need to stay put
            // while the dates scroll past them.
            className="grid gap-1"
            style={{
              gridTemplateColumns: `10rem repeat(${view.dates.length}, 3rem)`,
            }}
          >
            <div className="sticky left-0 z-10 bg-surface-raised" />
            {view.dates.map((date) => (
              <div key={date} className="pb-1 text-center font-ui text-2xs text-text-muted">
                {new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
                  weekday: 'short',
                  day: 'numeric',
                  timeZone: 'UTC',
                })}
              </div>
            ))}

            {view.participants.map((participant) => (
              <div key={participant.userId} className="contents">
                <div
                  className="sticky left-0 z-10 truncate bg-surface-raised pr-3 font-ui text-xs leading-8 text-text-primary"
                  title={participant.name}
                >
                  {participant.name}
                </div>
                {view.dates.map((date) => {
                  const day = participant.days.find((entry) => entry.date === date)
                  const presentation = cellPresentation(day?.state ?? null)
                  const label =
                    day?.state === 'YES' || day?.state === 'IF_NEED_BE'
                      ? `${String(day.fromHour).padStart(2, '0')}–${String(day.toHour).padStart(2, '0')}`
                      : ''

                  return (
                    <div
                      key={`${participant.userId}:${date}`}
                      title={label ? `${participant.name}: ${label}` : undefined}
                      className={cn(
                        'flex h-8 items-center justify-center rounded-sm border border-border-subtle',
                        'font-ui text-2xs',
                        presentation.className,
                      )}
                    >
                      <span aria-hidden="true">{presentation.glyph}</span>
                      <span className="sr-only">
                        {participant.name}: {presentation.label} {label}
                      </span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </TabsContent>

      <TabsContent value="pending" className="flex flex-col gap-4 pt-5">
        <div className="flex flex-col gap-2">
          <h4 className="font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-secondary">
            Still to answer ({pending.length})
          </h4>
          {pending.length === 0 ? (
            <p className="font-ui text-sm text-text-muted">Everybody has replied.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {pending.map((participant) => (
                <li key={participant.userId}>
                  <Badge variant="warning">{participant.name}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <h4 className="font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-secondary">
            Answered ({answered.length})
          </h4>
          <ul className="flex flex-wrap gap-2">
            {answered.map((participant) => (
              <li key={participant.userId}>
                <Badge variant="positive">{participant.name}</Badge>
              </li>
            ))}
          </ul>
        </div>
      </TabsContent>
    </Tabs>
  )
}

/** Maps a count onto the five-step ramp; zero stays unpainted. */
function intensityStep(free: number, total: number): number | null {
  if (free === 0 || total === 0) return null
  return Math.max(1, Math.min(5, Math.ceil((free / total) * 5)))
}

export type { SlotTally }
