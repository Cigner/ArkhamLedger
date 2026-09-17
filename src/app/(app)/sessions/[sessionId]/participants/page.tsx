import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { guardPage } from '@/lib/page-guards'
import { listEligibleParticipants } from '@/modules/sessions/data/participants'
import { requireSessionKeeper } from '@/modules/sessions/data/guards'
import { getSessionDetail } from '@/modules/sessions/data/sessions'
import { AttendanceForm } from '@/modules/sessions/ui/attendance-form'
import { ParticipantsForm } from '@/modules/sessions/ui/participants-form'

/**
 * Roster and priorities.
 *
 * Keeper-only: this is the one screen that shows priorities, and they are the
 * Keeper's private working notes rather than something the party sees about each
 * other.
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('sessions.participantsPage')
  return { title: t('title') }
}

export default async function SessionParticipantsPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
  const t = await getTranslations('sessions.participantsPage')
  const { session, candidates } = await guardPage(async () => {
    const context = await requireSessionKeeper(sessionId)
    const [detail, eligible] = await Promise.all([
      getSessionDetail(sessionId),
      listEligibleParticipants(context.campaignId),
    ])
    return { session: detail, candidates: eligible }
  })

  if (session.status === 'SCHEDULED') {
    return (
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('attendanceTitle')}</CardTitle>
            <CardDescription>{t('attendanceDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <AttendanceForm session={session} />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (session.status === 'COMPLETED' || session.status === 'CANCELLED') {
    return <p className="font-ui text-sm text-text-muted">{t('closed')}</p>
  }

  return <ParticipantsForm session={session} candidates={candidates} />
}
