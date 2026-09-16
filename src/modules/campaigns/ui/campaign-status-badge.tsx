import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'
import type { CampaignRole, CampaignStatus } from '../domain/types'

/**
 * Campaign status and role badges.
 *
 * Each carries its own word alongside its colour, so the list is readable
 * without distinguishing hues.
 */
const STATUS_PRESENTATION: Record<CampaignStatus, 'neutral' | 'positive' | 'warning' | 'muted'> = {
  PLANNING: 'neutral',
  ACTIVE: 'positive',
  ON_HIATUS: 'warning',
  COMPLETED: 'muted',
  ARCHIVED: 'muted',
}

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const t = useTranslations('campaigns.statuses')
  return <Badge variant={STATUS_PRESENTATION[status]}>{t(status)}</Badge>
}

/** Uses the Call of Cthulhu terms the group actually says out loud. */
export function CampaignRoleBadge({ role }: { role: CampaignRole }) {
  const t = useTranslations('roles')
  return role === 'KEEPER' ? (
    <Badge variant="candle">{t('keeper')}</Badge>
  ) : (
    <Badge variant="muted">{t('investigator')}</Badge>
  )
}
