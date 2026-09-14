import Link from 'next/link'
import { PageHeader } from '@/components/patterns/page-header'
import { guardPage } from '@/lib/page-guards'
import { getSessionDetail } from '@/modules/sessions/data/sessions'
import { SessionStatusBadge } from '@/modules/sessions/ui/session-status-badge'
import { SessionTabs } from '@/modules/sessions/ui/session-tabs'

/**
 * Session shell.
 *
 * The query authorizes campaign membership and raises NOT FOUND otherwise, so a
 * session id reveals nothing to somebody outside the campaign.
 */
export default async function SessionLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
  const session = await guardPage(() => getSessionDetail(sessionId))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={session.title}
        description={
          <Link
            href={`/campaigns/${session.campaignId}/sessions`}
            className="text-accent-text underline-offset-4 hover:underline"
          >
            {session.campaignName}
          </Link>
        }
        actions={<SessionStatusBadge status={session.status} />}
      />
      <SessionTabs sessionId={sessionId} isKeeper={session.viewer.isKeeper} />
      {children}
    </div>
  )
}
