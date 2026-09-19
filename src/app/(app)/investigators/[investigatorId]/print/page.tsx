import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { guardPage } from '@/lib/page-guards'
import { getInvestigatorView } from '@/modules/investigators/data/investigator-view'
import { PrintableSheet } from '@/modules/investigators/ui/printable-sheet'

/**
 * The character on paper.
 *
 * This is where the paper layout lives, rather than in the application's own
 * sheet: on screen a character is navigated, and on paper it is read all at once
 * in the arrangement people have been using for forty years.
 *
 * No PDF library. Every browser prints to PDF, and a server-side renderer would
 * be a second layout to keep in step with this one for no gain a reader would
 * notice.
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ investigatorId: string }>
}): Promise<Metadata> {
  const { investigatorId } = await params
  const t = await getTranslations('investigators.sheet')

  try {
    const view = await getInvestigatorView(investigatorId)
    return { title: view.sheet.identity.name ?? t('unnamed') }
  } catch {
    return { title: t('title') }
  }
}

export default async function PrintInvestigatorPage({
  params,
}: {
  params: Promise<{ investigatorId: string }>
}) {
  const { investigatorId } = await params
  const view = await guardPage(() => getInvestigatorView(investigatorId))

  return <PrintableSheet sheet={view.sheet} options={view.options} />
}
