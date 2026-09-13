import { Badge } from '@/components/ui/badge'
import type { CampaignRole, CampaignStatus } from '../domain/types'

/**
 * Campaign status and role badges.
 *
 * Each carries its own word alongside its colour, so the list is readable
 * without distinguishing hues.
 */
const STATUS_PRESENTATION: Record<
  CampaignStatus,
  { label: string; variant: 'neutral' | 'positive' | 'warning' | 'muted' }
> = {
  PLANNING: { label: 'Planning', variant: 'neutral' },
  ACTIVE: { label: 'Active', variant: 'positive' },
  ON_HIATUS: { label: 'On hiatus', variant: 'warning' },
  COMPLETED: { label: 'Completed', variant: 'muted' },
  ARCHIVED: { label: 'Archived', variant: 'muted' },
}

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const presentation = STATUS_PRESENTATION[status]
  return <Badge variant={presentation.variant}>{presentation.label}</Badge>
}

/** Uses the Call of Cthulhu terms the group actually says out loud. */
export function CampaignRoleBadge({ role }: { role: CampaignRole }) {
  return role === 'KEEPER' ? (
    <Badge variant="candle">Keeper</Badge>
  ) : (
    <Badge variant="muted">Investigator</Badge>
  )
}
