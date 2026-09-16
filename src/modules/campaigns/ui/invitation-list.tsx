'use client'

import { useAction } from 'next-safe-action/hooks'
import { useFormatter, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { revokeInvitation } from '../actions/invitations'
import type { InvitationListItem } from '../domain/types'

/**
 * Outstanding invitations.
 *
 * Revocation is immediate and is the answer to a link that went astray, which is
 * why it sits next to every row rather than behind a settings screen.
 */
export function InvitationList({
  campaignId,
  invitations,
}: {
  campaignId: string
  invitations: readonly InvitationListItem[]
}) {
  const t = useTranslations('campaigns.invitationList')
  const format = useFormatter()
  const revoke = useAction(revokeInvitation)

  if (invitations.length === 0) {
    return <p className="font-ui text-sm text-text-muted">{t('empty')}</p>
  }

  return (
    <TableContainer>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('columns.for')}</TableHead>
            <TableHead>{t('columns.role')}</TableHead>
            <TableHead>{t('columns.uses')}</TableHead>
            <TableHead>{t('columns.expires')}</TableHead>
            <TableHead className="text-right">{t('columns.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invitations.map((invitation) => (
            <TableRow key={invitation.id}>
              <TableCell>
                {invitation.targetUserName ?? (
                  <span className="text-text-muted">{t('anyone')}</span>
                )}
              </TableCell>
              <TableCell className="text-text-secondary">
                {invitation.roleOnJoin === 'KEEPER' ? t('keeper') : t('investigator')}
              </TableCell>
              <TableCell data-tabular className="text-text-secondary">
                {invitation.usedCount} / {invitation.maxUses}
              </TableCell>
              <TableCell className="text-text-secondary">
                <time dateTime={invitation.expiresAt.toISOString()}>
                  {format.dateTime(invitation.expiresAt, {
                    day: 'numeric',
                    month: 'long',
                  })}
                </time>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={revoke.isPending}
                  onClick={() => revoke.execute({ campaignId, invitationId: invitation.id })}
                >
                  {t('revoke')}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
