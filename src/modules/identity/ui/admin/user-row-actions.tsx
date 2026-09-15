'use client'

import { KeyRound, Trash2, UserCheck, UserX } from 'lucide-react'
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
import { Checkbox } from '@/components/ui/checkbox'
import { ConfirmDialog } from '@/components/patterns/confirm-dialog'
import { IconButton } from '@/components/patterns/icon-button'
import { deleteUser, regenerateActivationLink, setUserStatus } from '../../actions/admin'
import { blockerCount } from '../../domain/deletion'
import { resolveActionError } from '../action-errors'
import { FormError } from '../form-error'

/**
 * Why a removal was refused.
 *
 * Each of these is a race the interface cannot prevent: the counts it offered
 * the checkbox against were read when the page loaded, and somebody may have
 * created a campaign since.
 */
const MESSAGES: Record<string, string> = {
  'identity.errors.cannotDeleteSelf': 'You cannot remove your own account.',
  'identity.errors.ownsCampaigns':
    'They own a campaign. Transfer it first, or close the account instead.',
  'identity.errors.createdSessions':
    'They created a session somebody else may be waiting on. Close the account instead.',
  'identity.errors.createdInvitations':
    'They issued an invitation that is still on record. Close the account instead.',
  'identity.errors.createdScenarios':
    'They wrote a scenario a campaign still refers to. Close the account instead.',
  'identity.errors.issuedActivationLinks':
    'They issued an activation link for somebody else. Close the account instead.',
}
import type { AdminUserListItem } from '../../domain/types'
import { ActivationLinkPanel } from './activation-link-panel'

/**
 * What stands in the way of erasing an account, in a sentence.
 *
 * Listed rather than counted, because the remedy differs per kind: a campaign is
 * transferred, a session is cancelled, an invitation is revoked.
 */
function describeBlockers(blockers: AdminUserListItem['deletionBlockers']): string {
  const parts = [
    blockers.ownedCampaigns && `owns ${plural(blockers.ownedCampaigns, 'campaign')}`,
    blockers.createdSessions && `created ${plural(blockers.createdSessions, 'session')}`,
    blockers.createdInvitations && `issued ${plural(blockers.createdInvitations, 'invitation')}`,
    blockers.createdScenarios && `wrote ${plural(blockers.createdScenarios, 'scenario')}`,
    blockers.issuedActivationTokens &&
      `issued ${plural(blockers.issuedActivationTokens, 'activation link')}`,
  ].filter((part): part is string => typeof part === 'string')

  return parts.join(', ')
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

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
  const [confirmingRemoval, setConfirmingRemoval] = useState(false)
  const [erase, setErase] = useState(false)

  const reissue = useAction(regenerateActivationLink, {
    onSuccess: ({ data }) => {
      if (data) setIssued({ url: data.activationUrl, expiresAt: data.expiresAt })
    },
  })

  const changeStatus = useAction(setUserStatus, {
    onSettled: () => setConfirmingDisable(false),
  })

  const [removalError, setRemovalError] = useState<string | null>(null)

  const remove = useAction(deleteUser, {
    onSuccess: () => {
      setConfirmingRemoval(false)
      setErase(false)
      setRemovalError(null)
    },
    // The dialog stays open on failure: the refusal explains what to do next,
    // and closing it would leave an administrator wondering what happened.
    onError: ({ error }) =>
      setRemovalError(
        resolveActionError(
          MESSAGES,
          'Could not remove this account.',
          error.serverError?.messageKey,
          error.validationErrors,
        ),
      ),
  })

  /*
   * What this account authored. Anything here has to survive it, so erasing the
   * row is refused — the server counts again before acting, and the database
   * would refuse regardless.
   */
  const authored = blockerCount(user.deletionBlockers)
  const erasable = authored === 0

  const busy = reissue.isPending || changeStatus.isPending || remove.isPending

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

      {!isSelf ? (
        <IconButton
          variant="ghost"
          label="Remove this account"
          icon={<Trash2 className="size-4" aria-hidden="true" />}
          disabled={busy}
          onClick={() => setConfirmingRemoval(true)}
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
        open={confirmingRemoval}
        onOpenChange={(open) => {
          setConfirmingRemoval(open)
          if (!open) {
            setErase(false)
            setRemovalError(null)
          }
        }}
        title={`Remove ${user.name}?`}
        description={
          erase
            ? 'Their row and everything addressed to them is destroyed: memberships, availability, notifications. This cannot be undone.'
            : 'They are signed out, cannot sign in again, and leave every campaign. What they did — availability, attendance, sessions played — is kept.'
        }
        confirmLabel={erase ? 'Erase permanently' : 'Close the account'}
        destructive
        pending={remove.isPending}
        onConfirm={() => remove.execute({ userId: user.id, hard: erase })}
      >
        <label className="flex items-start gap-3">
          <Checkbox
            checked={erase}
            disabled={!erasable || remove.isPending}
            onCheckedChange={(checked) => setErase(checked === true)}
          />
          <span className="flex flex-col gap-0.5">
            <span className="font-ui text-sm text-text-primary">Erase everything</span>
            <span className="font-ui text-xs text-text-muted">
              {erasable
                ? 'Removes the row itself. Available because this account authored nothing anybody else depends on.'
                : `Not possible: ${describeBlockers(user.deletionBlockers)}. Those belong to other people’s history.`}
            </span>
          </span>
        </label>

        <FormError>{removalError}</FormError>
      </ConfirmDialog>

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
