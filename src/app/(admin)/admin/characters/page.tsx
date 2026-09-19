import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  listAllActiveBindings,
  listCampaignPlayers,
} from '@/modules/investigators/data/campaign-bindings'
import { EmergencyTransferDialog } from '@/modules/investigators/ui/emergency-transfer-dialog'

/**
 * The administrator's view of who is playing what.
 *
 * It exists for one operation: moving a character whose owner has stopped
 * answering, so a campaign does not quietly end because somebody left. It shows
 * no sheet contents - an administrator has no business reading a character, only
 * deciding who holds it.
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.characters')
  return { title: t('title') }
}

export default async function AdminCharactersPage() {
  const t = await getTranslations('admin.characters')
  const bindings = await listAllActiveBindings()

  const campaignIds = [...new Set(bindings.map((binding) => binding.campaignId))]
  const membersByCampaign = new Map(
    await Promise.all(
      campaignIds.map(
        async (campaignId) => [campaignId, await listCampaignPlayers(campaignId)] as const,
      ),
    ),
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-lg tracking-[--tracking-display] text-text-primary">
          {t('title')}
        </h2>
        <p className="font-ui text-sm text-text-secondary">{t('description')}</p>
      </div>

      {bindings.length === 0 ? (
        <p className="font-ui text-sm text-text-muted">{t('empty')}</p>
      ) : (
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('columns.character')}</TableHead>
                <TableHead>{t('columns.owner')}</TableHead>
                <TableHead>{t('columns.campaign')}</TableHead>
                <TableHead className="text-right">{t('columns.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bindings.map((binding) => (
                <TableRow key={`${binding.campaignId}:${binding.investigatorId}`}>
                  <TableCell>{binding.investigatorName ?? t('unnamed')}</TableCell>
                  <TableCell className="text-text-secondary">{binding.ownerName}</TableCell>
                  <TableCell className="text-text-secondary">{binding.campaignName}</TableCell>
                  <TableCell className="text-right">
                    <EmergencyTransferDialog
                      campaignId={binding.campaignId}
                      investigatorId={binding.investigatorId}
                      investigatorName={binding.investigatorName}
                      ownerName={binding.ownerName}
                      candidates={(membersByCampaign.get(binding.campaignId) ?? [])
                        .filter((member) => member.userId !== binding.ownerId)
                        .map((member) => ({ userId: member.userId, name: member.name }))}
                    />
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
