'use client'

import { useAction } from 'next-safe-action/hooks'
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
  const revoke = useAction(revokeInvitation)

  if (invitations.length === 0) {
    return (
      <p className="font-ui text-sm text-text-muted">No invitations are currently outstanding.</p>
    )
  }

  return (
    <TableContainer>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>For</TableHead>
            <TableHead>Joins as</TableHead>
            <TableHead>Uses</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invitations.map((invitation) => (
            <TableRow key={invitation.id}>
              <TableCell>
                {invitation.targetUserName ?? (
                  <span className="text-text-muted">Anyone with the link</span>
                )}
              </TableCell>
              <TableCell className="text-text-secondary">
                {invitation.roleOnJoin === 'KEEPER' ? 'Keeper' : 'Investigator'}
              </TableCell>
              <TableCell data-tabular className="text-text-secondary">
                {invitation.usedCount} / {invitation.maxUses}
              </TableCell>
              <TableCell className="text-text-secondary">
                <time dateTime={invitation.expiresAt.toISOString()}>
                  {invitation.expiresAt.toLocaleDateString('en-GB', {
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
                  Revoke
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
