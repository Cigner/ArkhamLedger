import type { Metadata } from 'next'
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
 * other. The guard refuses an Investigator here regardless of the missing tab.
 */
export const metadata: Metadata = { title: 'Participants' }
export const dynamic = 'force-dynamic'

export default async function SessionParticipantsPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
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
            <CardTitle>Who was there</CardTitle>
            <CardDescription>
              Record attendance and close the session. This cannot be undone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AttendanceForm session={session} />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (session.status === 'COMPLETED' || session.status === 'CANCELLED') {
    return (
      <p className="font-ui text-sm text-text-muted">
        This session is closed. Its roster is on the overview.
      </p>
    )
  }

  return <ParticipantsForm session={session} candidates={candidates} />
}
