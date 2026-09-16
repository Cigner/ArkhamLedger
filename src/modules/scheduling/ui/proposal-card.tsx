import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/cn'
import { formatWindow, hoursBetween } from '@/lib/datetime/format'
import type { CandidateExplanation, ProposalView } from '../domain/types'
import { namesOf } from './format'

/**
 * One proposed window.
 *
 * The date and the caveats come first and the score second. A Keeper decides on
 * "everyone is free except Kasia, who can manage it at a push", not on 90 - the
 * number is there to order the list and to make two close options comparable.
 *
 * Presentational on purpose: it renders what it is given and reports a choice
 * upwards, so the same card serves the ranked list and the record of what was
 * eventually chosen.
 */
export function ProposalCard({
  proposal,
  names,
  timezone,
  accepted,
  action,
}: {
  proposal: ProposalView
  names: Readonly<Record<string, string>>
  timezone: string
  accepted?: boolean
  action?: React.ReactNode
}) {
  const t = useTranslations('scheduling.proposal')
  const best = proposal.rank === 1
  const hours = hoursBetween(proposal.startUtc, proposal.endUtc)

  return (
    <li
      className={cn(
        'flex flex-col gap-3 rounded-sm border px-4 py-3',
        accepted
          ? 'border-status-positive/60 bg-surface-subtle'
          : best
            ? 'border-avail-best-ring bg-candle-a3'
            : 'border-border-subtle bg-surface-subtle',
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {/* Rank is a glyph and a number, never colour alone. */}
          <span data-tabular className="font-ui text-sm text-text-muted">
            {best ? '✦' : `${proposal.rank}.`}
          </span>
          <span data-tabular className="font-ui text-sm font-medium text-text-primary">
            <time dateTime={proposal.startUtc.toISOString()}>
              {formatWindow(proposal.startUtc, proposal.endUtc, timezone)}
            </time>
          </span>
          <span data-tabular className="font-ui text-xs text-text-secondary">
            {t('hours', { count: hours })}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {accepted ? <Badge variant="positive">{t('chosen')}</Badge> : null}
          <span data-tabular className="font-ui text-sm text-text-primary">
            {proposal.score}%
          </span>
        </div>
      </div>

      <p className="font-ui text-xs text-text-secondary">{headline(proposal.explanation, t)}</p>

      <ul className="flex flex-col gap-1">
        {proposal.explanation.notes.map((note) => (
          <li key={note.kind} className="font-ui text-xs text-text-muted">
            <span aria-hidden="true" className="mr-1.5 text-candle-11">
              ⚠
            </span>
            {note.kind === 'AT_A_PUSH'
              ? t('atPush', { names: namesOf(note.userIds, names) })
              : note.kind === 'UNAVAILABLE'
                ? t('unavailable', { names: namesOf(note.userIds, names) })
                : t('notAnswered', { count: note.count })}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span
          className={cn(
            'font-ui text-2xs uppercase tracking-[--tracking-smallcaps]',
            proposal.breakdown.quorumMet ? 'text-status-positive' : 'text-status-warning',
          )}
        >
          {t('freeCount', {
            available: proposal.breakdown.availableCount,
            total: proposal.breakdown.investigatorCount,
          })}
          {' · '}
          {proposal.breakdown.quorumMet
            ? t('quorumMet', { quorum: proposal.breakdown.quorum })
            : t('belowQuorum', { quorum: proposal.breakdown.quorum })}
        </span>
        {action}
      </div>
    </li>
  )
}

/**
 * The one-line summary above the caveats.
 *
 * "Met" means firmly free for the whole evening. Somebody free at a push is
 * counted as available but named below instead, because reporting them as free
 * is how a Keeper ends up surprised on the night.
 */
function headline(
  explanation: CandidateExplanation,
  t: ReturnType<typeof useTranslations>,
): string {
  if (explanation.headline === 'EVERYONE_FREE') return t('everyoneFree')

  const parts: string[] = []

  if (explanation.requiredTotal === 0) {
    parts.push(t('keeperFree'))
  } else if (explanation.requiredMet === explanation.requiredTotal) {
    parts.push(t('requiredFree'))
  } else {
    /*
     * The shortfall can only be somebody free at a push - an absence would have
     * taken the window out of the list entirely - so they can come, and the note
     * below names them rather than reducing them to a fraction.
     */
    parts.push(t('requiredCanCome'))
  }

  if (explanation.preferredTotal > 0) {
    parts.push(t('preferred', { met: explanation.preferredMet, total: explanation.preferredTotal }))
  }
  if (explanation.optionalTotal > 0) {
    parts.push(t('optional', { met: explanation.optionalMet, total: explanation.optionalTotal }))
  }

  return `${parts.join(' · ')}.`
}
