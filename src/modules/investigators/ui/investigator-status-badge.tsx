import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'
import type { InvestigatorStatus } from '../domain/lifecycle'

/**
 * A character's standing.
 *
 * A draft is marked because it is the one state that stops a character being
 * played, and a Keeper planning a session needs to see that at a glance rather
 * than on the evening.
 */
const STATUS_PRESENTATION: Record<
  InvestigatorStatus,
  'neutral' | 'candle' | 'positive' | 'warning' | 'muted' | 'danger'
> = {
  DRAFT: 'warning',
  ACTIVE: 'positive',
  RETIRED: 'muted',
  DECEASED: 'danger',
}

export function InvestigatorStatusBadge({ status }: { status: InvestigatorStatus }) {
  const t = useTranslations('investigators.statuses')
  return <Badge variant={STATUS_PRESENTATION[status]}>{t(status)}</Badge>
}
