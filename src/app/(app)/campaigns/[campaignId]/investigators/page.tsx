import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { EmptyState } from '@/components/patterns/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { guardPage } from '@/lib/page-guards'
import { getCampaignDetail } from '@/modules/campaigns/data/campaigns'
import {
  listCampaignInvestigators,
  listCampaignPlayers,
  listOwnInvestigators,
} from '@/modules/investigators/data/campaign-bindings'
import {
  DEFAULT_RULESET_ID,
  DEFAULT_RULESET_VERSION,
  requireRuleset,
} from '@/modules/investigators/domain/rulesets'
import { CreateForPlayerDialog } from '@/modules/investigators/ui/create-for-player-dialog'
import { InvestigatorRowActions } from '@/modules/investigators/ui/investigator-row-actions'
import { InvestigatorStatusBadge } from '@/modules/investigators/ui/investigator-status-badge'
import { TransferDialog } from '@/modules/investigators/ui/transfer-dialog'
import { LinkInvestigatorDialog } from '@/modules/investigators/ui/link-investigator-dialog'

/**
 * The characters a campaign is played with.
 *
 * Everybody in the campaign sees the list; it is who is at the table, which is
 * not private. What each sheet contains is another question, answered one
 * character at a time by the guard that knows who is asking.
 *
 * A Keeper may start a character for somebody. Nothing here reaches into a
 * player's other characters: the picker offers only the caller's own.
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('investigators.campaignList')
  return { title: t('title') }
}

export default async function CampaignInvestigatorsPage({
  params,
}: {
  params: Promise<{ campaignId: string }>
}) {
  const { campaignId } = await params
  const t = await getTranslations('investigators.campaignList')

  const { campaign, investigators, players, own } = await guardPage(async () => {
    const detail = await getCampaignDetail(campaignId)
    const [linked, members, mine] = await Promise.all([
      listCampaignInvestigators(campaignId),
      detail.viewer.role === 'KEEPER'
        ? listCampaignPlayers(campaignId)
        : Promise.resolve([] as { userId: string; name: string; isKeeper: boolean }[]),
      listOwnInvestigators(),
    ])
    return { campaign: detail, investigators: linked, players: members, own: mine }
  })

  const ruleset = requireRuleset(DEFAULT_RULESET_ID, DEFAULT_RULESET_VERSION)
  const isKeeper = campaign.viewer.role === 'KEEPER'

  const rulesetOption = {
    id: ruleset.manifest.id,
    version: ruleset.manifest.version,
    name: await getTranslations().then((translate) => translate(ruleset.manifest.nameKey)),
  }

  /*
   * The count of other campaigns travels with each character so the dialog can
   * warn before the link rather than at the first session that refuses it. A
   * count rather than names: section 11 keeps one campaign from learning what
   * else somebody plays, and the page belongs to a campaign.
   */
  const available = own
    .filter((entry) => !entry.linkedCampaignIds.includes(campaignId))
    .map((entry) => ({
      investigatorId: entry.investigatorId,
      name: entry.name,
      otherCampaigns: entry.linkedCampaignIds.length,
    }))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg tracking-[--tracking-display] text-text-primary">
          {t('title')}
        </h2>
        <div className="flex items-center gap-2">
          <LinkInvestigatorDialog
            campaignId={campaignId}
            available={available}
            ruleset={rulesetOption}
          />
          {isKeeper ? (
            <CreateForPlayerDialog
              campaignId={campaignId}
              /*
               * Keepers are not excluded. A Keeper runs the game and may also
               * play a character in it, and a campaign with two Keepers has one
               * making a sheet for the other. Only the caller is left out - they
               * make their own through the other control.
               */
              players={players.filter((player) => player.userId !== campaign.viewer.userId)}
              ruleset={rulesetOption}
            />
          ) : null}
        </div>
      </div>

      {investigators.length === 0 ? (
        <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('columns.name')}</TableHead>
                <TableHead>{t('columns.player')}</TableHead>
                <TableHead>{t('columns.status')}</TableHead>
                <TableHead className="text-right">{t('columns.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {investigators.map((entry) => (
                <TableRow key={entry.investigatorId}>
                  <TableCell>
                    {entry.name ?? (
                      <span className="font-ui text-sm text-text-muted">
                        {entry.nameHidden ? t('nameHidden') : t('unnamed')}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-text-secondary">
                    {entry.ownerName}
                    {entry.viewerOwns ? (
                      <span className="ml-2 font-ui text-xs text-text-muted">{t('you')}</span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <InvestigatorStatusBadge status={entry.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    {isKeeper ? (
                      <TransferDialog
                        campaignId={campaignId}
                        investigatorId={entry.investigatorId}
                        investigatorName={entry.name}
                        candidates={players
                          .filter((player) => player.userId !== entry.ownerId)
                          .map((player) => ({ userId: player.userId, name: player.name }))}
                      />
                    ) : null}
                    <InvestigatorRowActions
                      campaignId={campaignId}
                      investigatorId={entry.investigatorId}
                      canUnlink={entry.viewerOwns || isKeeper}
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
