'use client'

import { KeyRound, UserCheck, UserX } from 'lucide-react'
import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/patterns/confirm-dialog'
import { IconButton } from '@/components/patterns/icon-button'
import { regenerateActivationLink, setUserStatus } from '../../actions/admin'
import type { AdminUserListItem } from '../../domain/types'
import { ActivationLinkPanel } from './activation-link-panel'

/**
 * Per-user administrative actions.
 *
 * Reissuing a link and disabling an account both act on someone else's access,
 * so each is an explicit, separately confirmed action rather than an inline
 * toggle that can be hit by accident while scanning the table.
 *
 * Icons rather than words, because a table is read by scanning and a column of
 * verbs is a wall. Each carries its name for a screen reader and as a tooltip;
 * the confirmation that follows spells out the consequence in full.
 */
export function UserRowActions({ user, isSelf }: { user: AdminUserListItem; isSelf: boolean }) {
  const [issued, setIssued] = useState<{ url: string; expiresAt: Date } | null>(null)
  const [confirmingDisable, setConfirmingDisable] = useState(false)

  const reissue = useAction(regenerateActivationLink, {
    onSuccess: ({ data }) => {
      if (data) setIssued({ url: data.activationUrl, expiresAt: data.expiresAt })
    },
  })

  const changeStatus = useAction(setUserStatus, {
    onSettled: () => setConfirmingDisable(false),
  })

  const busy = reissue.isPending || changeStatus.isPending

  return (
    <div className="flex items-center justify-end gap-2">
      {user.status === 'PENDING_ACTIVATION' ? (
        <IconButton
          variant="ghost"
          label={reissue.isPending ? 'Issuing a new link…' : 'Issue a new activation link'}
          icon={<KeyRound className="size-4" aria-hidden="true" />}
          disabled={busy}
          onClick={() => reissue.execute({ userId: user.id })}
        />
      ) : null}

      {user.status === 'DISABLED' ? (
        <IconButton
          variant="ghost"
          label="Enable this account"
          icon={<UserCheck className="size-4" aria-hidden="true" />}
          disabled={busy}
          onClick={() => changeStatus.execute({ userId: user.id, status: 'ACTIVE' })}
        />
      ) : null}

      {user.status === 'ACTIVE' && !isSelf ? (
        <IconButton
          variant="ghost"
          label="Disable this account"
          icon={<UserX className="size-4" aria-hidden="true" />}
          disabled={busy}
          onClick={() => setConfirmingDisable(true)}
        />
      ) : null}

      <Dialog open={issued !== null} onOpenChange={(open) => !open && setIssued(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New activation link</DialogTitle>
            <DialogDescription>
              The previous link for {user.name} no longer works. This one will not be shown again.
            </DialogDescription>
          </DialogHeader>
          {issued ? (
            <DialogBody>
              <ActivationLinkPanel url={issued.url} expiresAt={issued.expiresAt} />
            </DialogBody>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssued(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmingDisable}
        onOpenChange={setConfirmingDisable}
        title={`Disable ${user.name}?`}
        description="They will be signed out immediately and cannot sign in again until the account is enabled. Their campaigns and past sessions are untouched."
        confirmLabel="Disable account"
        destructive
        pending={changeStatus.isPending}
        onConfirm={() => changeStatus.execute({ userId: user.id, status: 'DISABLED' })}
      />
    </div>
  )
}
