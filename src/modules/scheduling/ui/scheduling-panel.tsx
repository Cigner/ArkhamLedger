'use client'

import { CalendarSearch, RefreshCw } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
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
export function SchedulingPanel({ view }: { view: SchedulingView }) {
  const t = useTranslations('scheduling.panel')
  const format = useFormatter()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pendingChoice, setPendingChoice] = useState<ProposalView | null>(null)
  const messages: Record<string, string> = {
    'scheduling.errors.notSearchable': t('errors.notSearchable'),
    'scheduling.errors.proposalStale': t('errors.proposalStale'),
    'sessions.errors.sessionMovedOn': t('errors.sessionMovedOn'),
    'sessions.errors.invalidTransition': t('errors.invalidTransition'),
    'errors.rateLimited': t('errors.rateLimited'),
  }

  const search = useAction(runScheduling, {
    onSuccess: () => router.refresh(),
    onError: ({ error: failure }) =>
      setError(
        resolveActionError(
          messages,
          t('errors.searchFailed'),
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
          messages,
          t('errors.confirmFailed'),
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
            {t('summary', {
              responded: view.respondentCount,
              total: view.participantCount,
              quorum: view.quorum,
              hours: view.minSessionHours,
            })}
          </p>
          {view.run ? (
            <p className="font-ui text-xs text-text-muted">
              {t('lastSearched')}{' '}
              <time dateTime={view.run.createdAt.toISOString()}>
                {format.dateTime(view.run.createdAt, {
                  day: 'numeric',
                  month: 'long',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: view.timezone,
                })}
              </time>{' '}
              {t('algorithm', { version: view.run.algorithmVersion })}
            </p>
          ) : null}
        </div>

        {view.canRun ? (
          <Button variant="accent" disabled={search.isPending} onClick={runSearch}>
            {view.run ? (
              <RefreshCw className="size-4" aria-hidden="true" />
            ) : (
              <CalendarSearch className="size-4" aria-hidden="true" />
            )}
            {search.isPending ? t('searching') : view.run ? t('searchAgain') : t('findDates')}
          </Button>
        ) : null}
      </div>

      {/*
        A ranking is a snapshot of the answers at the moment it ran. Saying so is
        cheaper than silently re-running and changing a list somebody is reading.
      */}
      {view.run?.staleAnswers ? (
        <p className="rounded-sm border border-status-warning/50 bg-candle-3 px-3 py-2 font-ui text-xs text-candle-11">
          {t('stale')}
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
                    {t('choose')}
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
          title={t('emptyTitle')}
          icon={<CalendarSearch className="size-8" strokeWidth={1.25} />}
          description={t('emptyDescription')}
          action={
            view.canRun ? (
              <Button variant="accent" disabled={search.isPending} onClick={runSearch}>
                <CalendarSearch className="size-4" aria-hidden="true" />
                {search.isPending ? t('searching') : t('findDates')}
              </Button>
            ) : null
          }
        />
      )}

      <ConfirmDialog
        open={pendingChoice !== null}
        onOpenChange={(open) => !open && setPendingChoice(null)}
        title={t('confirmTitle')}
        description={
          pendingChoice
            ? t('confirmDescription', {
                window: formatWindow(pendingChoice.startUtc, pendingChoice.endUtc, view.timezone),
                timezone: view.timezone,
              })
            : undefined
        }
        confirmLabel={t('confirm')}
        pending={accept.isPending}
        onConfirm={() => {
          if (!pendingChoice) return
          accept.execute({ sessionId: view.sessionId, proposalId: pendingChoice.id })
        }}
      />
    </div>
  )
}
