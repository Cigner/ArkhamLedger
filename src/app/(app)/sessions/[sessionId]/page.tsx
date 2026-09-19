import { CalendarClock, FileText, ScrollText, TriangleAlert, Users, Wand2 } from 'lucide-react'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { formatDeadline } from '@/lib/datetime/format'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { listAssignmentRows } from '@/modules/investigators/data/assignments'
import { resolveInvestigatorRole } from '@/modules/investigators/data/guards'
import { findSessionSnapshots } from '@/modules/investigators/data/snapshots'
import { buildSheetOptions } from '@/modules/investigators/data/sheet-options'
import { compareSheets } from '@/modules/investigators/domain/comparison'
import { SessionComparison } from '@/modules/investigators/ui/session-comparison'
import { listCampaignInvestigators } from '@/modules/investigators/data/campaign-bindings'
import { SessionAssignments } from '@/modules/investigators/ui/session-assignments'
import { getSessionDetail } from '@/modules/sessions/data/sessions'
import { canAssignInvestigators } from '@/modules/sessions/domain/lifecycle'
import { KeeperActions } from '@/modules/sessions/ui/keeper-actions'
import { ResponseProgress } from '@/modules/sessions/ui/response-progress'
import { SessionWhen } from '@/modules/sessions/ui/session-when'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sessionId: string }>
}): Promise<Metadata> {
  const { sessionId } = await params
  const session = await getSessionDetail(sessionId)
  return { title: session.title }
}

export default async function SessionOverviewPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
  const t = await getTranslations('sessions.overview')
  const session = await getSessionDetail(sessionId)

  /*
   * Characters are only offered from what is already in the campaign, so a
   * Keeper choosing for somebody never sees the rest of that person's Vault.
   */
  const [assignments, campaignCharacters] = await Promise.all([
    listAssignmentRows(sessionId),
    listCampaignInvestigators(session.campaignId),
  ])

  const choices = Object.fromEntries(
    [...new Set(campaignCharacters.map((character) => character.ownerId))].map((ownerId) => [
      ownerId,
      campaignCharacters
        .filter((character) => character.ownerId === ownerId && !character.isDraft)
        .map((character) => ({
          investigatorId: character.investigatorId,
          name: character.name,
        })),
    ]),
  )

  /*
   * Only once the session is over. A comparison needs both snapshots, and the
   * second one is taken when the evening ends.
   */
  const comparisons =
    session.status === 'COMPLETED'
      ? (
          await Promise.all(
            assignments
              .filter((row) => row.investigatorId !== null)
              .map(async (row) => {
                /*
                 * Asked through the character's own guard rather than assumed
                 * from being at this session. It answers both questions at
                 * once: whether this reader may see the sheet at all, and with
                 * what standing - and the pair comes back projected for it, so
                 * a summary of the evening can never say more than the sheet
                 * would.
                 */
                const context = await resolveInvestigatorRole(row.investigatorId!)
                if (!context) return null

                const pair = await findSessionSnapshots({
                  sessionId,
                  investigatorId: row.investigatorId!,
                  role: context,
                })
                if (!pair) return null

                return {
                  name: row.investigatorName ?? row.name,
                  comparison: compareSheets(pair.before, pair.after),
                  options: buildSheetOptions({
                    rulesetId: pair.after.rulesetId,
                    rulesetVersion: pair.after.rulesetVersion,
                    characteristics: pair.after.characteristics,
                    occupationId: pair.after.identity.occupationId,
                    occupationCharacteristic: pair.after.identity.occupationCharacteristic,
                  }),
                }
              }),
          )
        ).flatMap((entry) => (entry === null ? [] : [entry]))
      : []

  const responded = session.participants.filter(
    (participant) => participant.respondedAt !== null,
  ).length

  // Quorum counts players. The Keeper has to be there regardless, so including
  // them would describe a lower bar than the campaign actually set.
  const playerCount = session.participants.filter((participant) => !participant.isKeeper).length

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-6 lg:col-span-2">
        {session.status === 'CANCELLED' && session.cancelledReason ? (
          <Card className="border-status-danger/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TriangleAlert className="size-4 text-status-danger" aria-hidden="true" />
                {t('cancelled')}
              </CardTitle>
            </CardHeader>
            <CardContent className="font-ui text-sm text-text-secondary">
              {session.cancelledReason}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="size-4 text-text-muted" aria-hidden="true" />
              {t('when')}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <SessionWhen
              confirmedStartUtc={session.confirmedStartUtc}
              confirmedEndUtc={session.confirmedEndUtc}
              searchWindowStart={session.searchWindowStart}
              searchWindowEnd={session.searchWindowEnd}
              timezone={session.timezone}
            />

            {session.availabilityDeadline && session.status === 'COLLECTING' ? (
              <p className="font-ui text-sm text-text-secondary">
                {t('answerBy')}{' '}
                <time dateTime={session.availabilityDeadline.toISOString()}>
                  {formatDeadline(session.availabilityDeadline, session.timezone)}
                </time>
              </p>
            ) : null}

            {session.status === 'COLLECTING' || session.status === 'PROPOSED' ? (
              <ResponseProgress responded={responded} total={session.participants.length} />
            ) : null}

            {session.viewer.isParticipant && session.status === 'COLLECTING' ? (
              <p className="font-ui text-sm text-text-secondary">
                {session.viewer.ownResponse ? t('answered') : t('notAnswered')}
                {session.viewer.ownPresenceRequired ? (
                  <span className="ml-1 text-candle-11">{t('needsYou')}</span>
                ) : null}
              </p>
            ) : null}
          </CardContent>
        </Card>

        {session.description ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-4 text-text-muted" aria-hidden="true" />
                {t('description')}
              </CardTitle>
            </CardHeader>
            <CardContent className="font-body text-base leading-[--leading-body] text-text-secondary">
              {session.description}
            </CardContent>
          </Card>
        ) : null}

        {comparisons.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ScrollText className="size-4 text-text-muted" aria-hidden="true" />
                {t('whatHappened')}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {comparisons.map((entry) => (
                <SessionComparison
                  key={entry.name}
                  name={entry.name}
                  comparison={entry.comparison}
                  options={entry.options}
                />
              ))}
            </CardContent>
          </Card>
        ) : null}

        {assignments.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ScrollText className="size-4 text-text-muted" aria-hidden="true" />
                {t('characters')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SessionAssignments
                sessionId={sessionId}
                rows={assignments}
                choices={choices}
                canEdit={session.viewer.isKeeper && canAssignInvestigators(session.status).ok}
              />
            </CardContent>
          </Card>
        ) : null}

        {session.viewer.isKeeper ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wand2 className="size-4 text-text-muted" aria-hidden="true" />
                {t('keeper')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <KeeperActions session={session} />
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4 text-text-muted" aria-hidden="true" />
            {t('invited')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-3">
            {session.participants.map((participant) => (
              <li key={participant.userId} className="flex items-center justify-between gap-3">
                <span className="font-ui text-sm text-text-primary">
                  {participant.name}
                  {participant.userId === session.viewer.userId ? (
                    <span className="ml-2 text-xs text-text-muted">{t('you')}</span>
                  ) : null}
                </span>

                {session.status === 'COMPLETED' ? (
                  <Badge variant={participant.attendance === 'ATTENDED' ? 'positive' : 'muted'}>
                    {participant.attendance === 'ATTENDED'
                      ? t('attendance.attended')
                      : participant.attendance === 'ABSENT'
                        ? t('attendance.absent')
                        : t('attendance.unknown')}
                  </Badge>
                ) : participant.isKeeper ? (
                  <Badge variant="candle">{t('keeper')}</Badge>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="mt-4 font-ui text-xs text-text-muted">
            {t('quorum', { required: session.quorum, total: playerCount })}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
