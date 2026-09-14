'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { Button } from '@/components/ui/button'
import { formatWindow } from '@/lib/datetime/format'
import { ConfirmDialog } from '@/components/patterns/confirm-dialog'
import { EmptyState } from '@/components/patterns/empty-state'
import { resolveActionError } from '@/modules/identity/ui/action-errors'
import { FormError } from '@/modules/identity/ui/form-error'
import { acceptProposal, runScheduling } from '../actions/scheduling'
import type { ProposalView, SchedulingView } from '../domain/types'
import { SchedulingDiagnostics } from './diagnostics'
import { ProposalCard } from './proposal-card'

/**
 * Choosing the date.
 *
 * Searching and confirming are deliberately separate acts. A search is cheap and
 * repeatable and changes nothing, so it needs no confirmation; confirming a date
 * tells everybody invited and is what the whole session then hangs on, so it
 * asks first and names the evening it is about to commit to.
 */
const MESSAGES: Record<string, string> = {
  'scheduling.errors.notSearchable':
    'Dates can only be searched while a session is collecting answers or choosing between them.',
  'scheduling.errors.proposalStale':
    'That suggestion came from an earlier search. Search again and pick from the new list.',
  'sessions.errors.sessionMovedOn': 'Somebody else changed this session. Reload and try again.',
  'sessions.errors.invalidTransition': 'That is not possible from the session’s current state.',
  'errors.rateLimited': 'That search has run a lot recently. Give it a few minutes.',
}

export function SchedulingPanel({ view }: { view: SchedulingView }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pendingChoice, setPendingChoice] = useState<ProposalView | null>(null)

  const search = useAction(runScheduling, {
    onSuccess: () => router.refresh(),
    onError: ({ error: failure }) =>
      setError(
        resolveActionError(
          MESSAGES,
          'Could not search for dates.',
          failure.serverError?.messageKey,
          failure.validationErrors,
        ),
      ),
  })

  const accept = useAction(acceptProposal, {
    onSuccess: () => {
      setPendingChoice(null)
      router.refresh()
    },
    onError: ({ error: failure }) =>
      setError(
        resolveActionError(
          MESSAGES,
          'Could not confirm that date.',
          failure.serverError?.messageKey,
          failure.validationErrors,
        ),
      ),
  })

  const runSearch = () => {
    setError(null)
    search.execute({ sessionId: view.sessionId })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="font-ui text-sm text-text-secondary">
            {view.respondentCount} of {view.participantCount} have answered. Quorum is {view.quorum}
            , and a session runs at least {view.minSessionHours} hours.
          </p>
          {view.run ? (
            <p className="font-ui text-xs text-text-muted">
              Last searched{' '}
              <time dateTime={view.run.createdAt.toISOString()}>
                {view.run.createdAt.toLocaleString('en-GB', {
                  day: 'numeric',
                  month: 'long',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: view.timezone,
                })}
              </time>{' '}
              · algorithm {view.run.algorithmVersion}
            </p>
          ) : null}
        </div>

        {view.canRun ? (
          <Button variant="accent" disabled={search.isPending} onClick={runSearch}>
            {search.isPending ? 'Searching…' : view.run ? 'Search again' : 'Find dates'}
          </Button>
        ) : null}
      </div>

      {/*
        A ranking is a snapshot of the answers at the moment it ran. Saying so is
        cheaper than silently re-running and changing a list somebody is reading.
      */}
      {view.run?.staleAnswers ? (
        <p className="rounded-sm border border-status-warning/50 bg-candle-3 px-3 py-2 font-ui text-xs text-candle-11">
          Somebody has answered since this search ran. Search again to take their answer into
          account.
        </p>
      ) : null}

      <FormError>{error}</FormError>

      {view.proposals.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {view.proposals.map((proposal) => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              names={view.names}
              timezone={view.timezone}
              accepted={proposal.id === view.acceptedProposalId}
              action={
                view.acceptedProposalId === proposal.id ? null : (
                  <Button
                    variant={proposal.rank === 1 ? 'accent' : 'outline'}
                    size="sm"
                    disabled={accept.isPending}
                    onClick={() => {
                      setError(null)
                      setPendingChoice(proposal)
                    }}
                  >
                    Choose this date
                  </Button>
                )
              }
            />
          ))}
        </ul>
      ) : view.run ? (
        <SchedulingDiagnostics
          summary={view.run.summary}
          names={view.names}
          sessionId={view.sessionId}
          respondentCount={view.respondentCount}
          participantCount={view.participantCount}
        />
      ) : (
        <EmptyState
          title="No dates worked out yet"
          description="Search once enough people have answered. Nothing is decided by searching — it only ranks the evenings that would work."
          action={
            view.canRun ? (
              <Button variant="accent" disabled={search.isPending} onClick={runSearch}>
                {search.isPending ? 'Searching…' : 'Find dates'}
              </Button>
            ) : null
          }
        />
      )}

      <ConfirmDialog
        open={pendingChoice !== null}
        onOpenChange={(open) => !open && setPendingChoice(null)}
        title="Confirm this date?"
        description={
          pendingChoice
            ? `${formatWindow(pendingChoice.startUtc, pendingChoice.endUtc, view.timezone)} in ${view.timezone}. Everyone invited is told, and answers close.`
            : undefined
        }
        confirmLabel="Confirm date"
        pending={accept.isPending}
        onConfirm={() => {
          if (!pendingChoice) return
          accept.execute({ sessionId: view.sessionId, proposalId: pendingChoice.id })
        }}
      />
    </div>
  )
}
