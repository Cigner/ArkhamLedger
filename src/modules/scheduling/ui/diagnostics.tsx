import { ButtonLink } from '@/components/ui/button-link'
import type { RejectionSummary } from '../domain/types'
import { namesOf } from './format'

/**
 * Why no date worked.
 *
 * The screen that decides whether this tool is useful on a bad week. "No date
 * satisfies all constraints" is where Doodle leaves people; what a Keeper needs
 * is who to ring and what to change, so every sentence here names either a
 * person or a setting.
 */
export function SchedulingDiagnostics({
  summary,
  names,
  sessionId,
  respondentCount,
  participantCount,
}: {
  summary: RejectionSummary
  names: Readonly<Record<string, string>>
  sessionId: string
  respondentCount: number
  participantCount: number
}) {
  /*
   * Nobody answering looks identical to everybody refusing, and the algorithm
   * reports it as the Keeper being unavailable — technically true and useless.
   * Said plainly instead, because the remedy is completely different.
   */
  if (respondentCount === 0) {
    return (
      <Panel title="Nobody has answered yet">
        <p>
          No date can be worked out until people say when they are free. None of the{' '}
          {participantCount} invited have answered.
        </p>
        <ButtonLink href={`/sessions/${sessionId}/availability`} variant="outline" size="sm">
          See who is missing
        </ButtonLink>
      </Panel>
    )
  }

  if (summary.windowsConsidered === 0) {
    return (
      <Panel title="No window is long enough">
        <p>
          Every day in the search offers fewer hours than the session needs, so there was nothing
          to rank. Widen the hours the grid covers, or shorten the minimum length.
        </p>
      </Panel>
    )
  }

  const blockers = summary.blockedBy.slice(0, 3)

  return (
    <Panel title="No date works for everyone who has to be there">
      <p>
        All {summary.windowsConsidered} possible evenings were ruled out.
        {summary.byReason.KEEPER_UNAVAILABLE > 0
          ? ` ${summary.byReason.KEEPER_UNAVAILABLE} because a Keeper is not free.`
          : ''}
        {summary.byReason.REQUIRED_UNAVAILABLE > 0
          ? ` ${summary.byReason.REQUIRED_UNAVAILABLE} because somebody required is not free.`
          : ''}
        {summary.byReason.QUORUM_NOT_MET > 0
          ? ` ${summary.byReason.QUORUM_NOT_MET} because too few players are free: the best any evening reached was ${summary.bestAvailableCount} of the ${summary.quorum} needed.`
          : ''}
      </p>

      {blockers.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {blockers.map((blocker) => (
            <li key={blocker.userId} className="font-ui text-sm text-text-secondary">
              <strong className="font-medium text-text-primary">
                {namesOf([blocker.userId], names)}
              </strong>{' '}
              rules out {blocker.windows} of them.
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-col gap-1 border-t border-border-subtle pt-3">
        <p className="font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-secondary">
          What can change
        </p>
        <ul className="list-disc pl-5 font-ui text-sm text-text-muted marker:text-text-muted">
          <li>Search a wider range of dates.</li>
          {summary.byReason.QUORUM_NOT_MET > 0 ? (
            <li>Lower the quorum from {summary.quorum} to {Math.max(1, summary.bestAvailableCount)}.</li>
          ) : null}
          {blockers.length > 0 ? (
            <li>
              Make {namesOf([blockers[0]?.userId ?? ''], names)} optional, or ask them to answer
              again.
            </li>
          ) : null}
          <li>Shorten the minimum length, or start earlier in the day.</li>
        </ul>
      </div>
    </Panel>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-sm border border-status-warning/40 bg-surface-subtle px-4 py-4">
      <h3 className="font-display text-base tracking-[--tracking-display] text-text-primary">
        {title}
      </h3>
      <div className="flex flex-col gap-3 font-ui text-sm text-text-secondary">{children}</div>
    </section>
  )
}
