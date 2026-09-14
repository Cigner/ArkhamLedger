import type { Metadata } from 'next'
import Link from 'next/link'
import { ButtonLink } from '@/components/ui/button-link'
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/patterns/empty-state'
import { getCampaignDetail } from '@/modules/campaigns/data/campaigns'
import { listCampaignSessions } from '@/modules/sessions/data/sessions'
import { ResponseProgress } from '@/modules/sessions/ui/response-progress'
import { SessionStatusBadge } from '@/modules/sessions/ui/session-status-badge'
import { SessionWhen } from '@/modules/sessions/ui/session-when'

/**
 * Sessions in a campaign.
 *
 * Ordered by what still needs somebody to act, not by date: a session waiting on
 * answers is the reason to open this screen, and history is the reason to scroll.
 */
export const metadata: Metadata = { title: 'Sessions' }
export const dynamic = 'force-dynamic'

export default async function CampaignSessionsPage({
  params,
}: {
  params: Promise<{ campaignId: string }>
}) {
  const { campaignId } = await params
  const [campaign, sessions] = await Promise.all([
    getCampaignDetail(campaignId),
    listCampaignSessions(campaignId),
  ])

  const isKeeper = campaign.viewer.role === 'KEEPER'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg tracking-[--tracking-display] text-text-primary">
          Sessions
        </h2>
        {isKeeper ? (
          <ButtonLink variant="accent" href={`/campaigns/${campaignId}/sessions/new`}>
            New session
          </ButtonLink>
        ) : null}
      </div>

      {sessions.length === 0 ? (
        <EmptyState
          title="Nothing is planned"
          description={
            isKeeper
              ? 'Create a session and ask the party when they are free.'
              : 'The Keeper has not planned anything yet.'
          }
          action={
            isKeeper ? (
              <ButtonLink variant="accent" href={`/campaigns/${campaignId}/sessions/new`}>
                New session
              </ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Session</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Answers</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => (
                <TableRow key={session.id}>
                  <TableCell>
                    <Link href={`/sessions/${session.id}`} className="hover:underline">
                      {session.title}
                    </Link>
                    {session.viewerIsParticipant && !session.viewerHasResponded &&
                    session.status === 'COLLECTING' ? (
                      <span className="ml-2 font-ui text-2xs uppercase tracking-[--tracking-smallcaps] text-candle-11">
                        Needs your answer
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <SessionStatusBadge status={session.status} />
                  </TableCell>
                  <TableCell>
                    <SessionWhen
                      confirmedStartUtc={session.confirmedStartUtc}
                      confirmedEndUtc={session.confirmedEndUtc}
                      searchWindowStart={session.searchWindowStart}
                      searchWindowEnd={session.searchWindowEnd}
                      timezone={session.timezone}
                    />
                  </TableCell>
                  <TableCell>
                    {session.status === 'COLLECTING' || session.status === 'PROPOSED' ? (
                      <ResponseProgress
                        responded={session.respondedCount}
                        total={session.participantCount}
                      />
                    ) : (
                      <span className="font-ui text-sm text-text-muted">
                        {session.participantCount} invited
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </div>
  )
}
