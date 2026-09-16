import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { guardPage } from '@/lib/page-guards'
import { getAvailabilityView } from '@/modules/availability/data/availability'
import { AvailabilityPanel } from '@/modules/availability/ui/availability-panel'
import { KeeperAvailability } from '@/modules/availability/ui/keeper-availability'

/**
 * Availability.
 *
 * One screen for both roles, because a Keeper is also a player and answering is
 * the same act for them. What differs is what comes back from the query: a
 * Keeper's view carries names, an Investigator's carries counts.
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('availability.page')
  return { title: t('title') }
}

export default async function AvailabilityPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
  const t = await getTranslations('availability.page')
  const view = await guardPage(() => getAvailabilityView(sessionId))

  return (
    <div className="flex flex-col gap-8">
      <AvailabilityPanel view={view} />

      {view.participants.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('keeper')}</CardTitle>
          </CardHeader>
          <CardContent>
            <KeeperAvailability view={view} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
