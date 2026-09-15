import { Pencil } from 'lucide-react'
import type { Metadata } from 'next'
import { PageHeader } from '@/components/patterns/page-header'
import { guardPage } from '@/lib/page-guards'
import { requireSessionKeeper } from '@/modules/sessions/data/guards'
import { getSessionDetail } from '@/modules/sessions/data/sessions'
import { SessionDefinitionForm } from '@/modules/sessions/ui/session-definition-form'

/**
 * Editing a session.
 *
 * Keeper only, and the guard says so rather than the missing link. Allowed while
 * answers are being collected as well as while the session is a draft: a
 * mistyped date should not cost the whole session, and the form warns about what
 * changing the dates does to the answers already given.
 */
export const metadata: Metadata = { title: 'Edit session' }
export const dynamic = 'force-dynamic'

export default async function EditSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params

  const session = await guardPage(async () => {
    await requireSessionKeeper(sessionId)
    return getSessionDetail(sessionId)
  })

  const responded = session.participants.filter(
    (participant) => participant.respondedAt !== null,
  ).length

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Edit session"
        icon={<Pencil className="size-6" strokeWidth={1.5} />}
        description={session.title}
      />
      <SessionDefinitionForm
        campaignId={session.campaignId}
        session={session}
        respondentCount={responded}
      />
    </div>
  )
}
