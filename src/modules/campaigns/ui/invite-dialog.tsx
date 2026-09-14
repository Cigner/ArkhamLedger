'use client'

import { Link2, UserPlus } from 'lucide-react'
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
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { resolveActionError } from '@/modules/identity/ui/action-errors'
import { FormError } from '@/modules/identity/ui/form-error'
import { ActivationLinkPanel } from '@/modules/identity/ui/admin/activation-link-panel'
import { createInvitation } from '../actions/invitations'

/**
 * Issues an invitation link.
 *
 * Two modes share one dialog because they share one lifecycle: a personal
 * invitation names its recipient and is single-use, a shared link is open and
 * counted. Switching between them is one control rather than two screens.
 */
const MODE_LABELS = { personal: 'One specific person', shared: 'Anyone with the link' } as const
const ROLE_LABELS = { INVESTIGATOR: 'Investigator', KEEPER: 'Keeper' } as const

const MESSAGES: Record<string, string> = {
  'campaigns.errors.alreadyAMember': 'They are already in this campaign.',
  'campaigns.errors.campaignArchived': 'This campaign is archived and cannot be changed.',
  'campaigns.errors.personalInvitationMustBeSingleUse':
    'A personal invitation can only be used once.',
}

export function InviteDialog({
  campaignId,
  invitableUsers,
}: {
  campaignId: string
  invitableUsers: readonly { id: string; name: string; email: string; pending: boolean }[]
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'personal' | 'shared'>('personal')
  const [targetUserId, setTargetUserId] = useState<string>(invitableUsers[0]?.id ?? '')
  const [role, setRole] = useState<'INVESTIGATOR' | 'KEEPER'>('INVESTIGATOR')
  const [maxUses, setMaxUses] = useState('5')
  const [error, setError] = useState<string | null>(null)
  const [issued, setIssued] = useState<{ url: string; expiresAt: Date } | null>(null)

  const { execute, isPending } = useAction(createInvitation, {
    onSuccess: ({ data }) => {
      if (data) setIssued({ url: data.invitationUrl, expiresAt: data.expiresAt })
    },
    onError: ({ error: actionError }) => {
      setError(
        resolveActionError(
          MESSAGES,
          'Could not create the invitation.',
          actionError.serverError?.messageKey,
          actionError.validationErrors,
        ),
      )
    },
  })

  const userLabels = Object.fromEntries(
    invitableUsers.map((user) => [
      user.id,
      user.pending ? `${user.name} (not yet activated)` : user.name,
    ]),
  )

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    execute({
      campaignId,
      roleOnJoin: role,
      ...(mode === 'personal' ? { targetUserId, maxUses: 1 } : { maxUses: Number(maxUses) || 1 }),
    })
  }

  function reset(next: boolean) {
    setOpen(next)
    if (!next) {
      setIssued(null)
      setError(null)
      setMode('personal')
    }
  }

  const noCandidates = invitableUsers.length === 0

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger render={<Button variant="accent" />}>
        <UserPlus className="size-4" aria-hidden="true" />
        Invite
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{issued ? 'Invitation ready' : 'Invite to the campaign'}</DialogTitle>
          <DialogDescription>
            {issued
              ? 'Send this link to whoever should join. It will not be shown again.'
              : 'Invitations work for people who already have an account here.'}
          </DialogDescription>
        </DialogHeader>

        {issued ? (
          <>
            <DialogBody>
              <ActivationLinkPanel url={issued.url} expiresAt={issued.expiresAt} />
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => reset(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogBody className="flex flex-col gap-4">
              <Field>
                <FieldLabel>Who is this for</FieldLabel>
                <Select
                  items={MODE_LABELS}
                  value={mode}
                  onValueChange={(value) => setMode(value === 'shared' ? 'shared' : 'personal')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">One specific person</SelectItem>
                    <SelectItem value="shared">Anyone with the link</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              {mode === 'personal' ? (
                <Field>
                  <FieldLabel>Person</FieldLabel>
                  {noCandidates ? (
                    <p className="font-ui text-sm text-text-muted">
                      Everyone with an account is already in this campaign.
                    </p>
                  ) : (
                    <Select
                      items={userLabels}
                      value={targetUserId}
                      onValueChange={(value) => setTargetUserId(String(value))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {invitableUsers.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name}
                            {user.pending ? (
                              <span className="ml-2 text-xs text-text-muted">
                                not yet activated
                              </span>
                            ) : null}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <FieldDescription>
                    Only they can use the link, even if it is forwarded.
                  </FieldDescription>
                </Field>
              ) : (
                <Field>
                  <FieldLabel htmlFor="maxUses">Number of uses</FieldLabel>
                  <Input
                    id="maxUses"
                    type="number"
                    min={1}
                    max={50}
                    value={maxUses}
                    onChange={(event) => setMaxUses(event.target.value)}
                    disabled={isPending}
                  />
                  <FieldDescription>
                    The link stops working once this many people have joined.
                  </FieldDescription>
                </Field>
              )}

              <Field>
                <FieldLabel>Join as</FieldLabel>
                <Select
                  items={ROLE_LABELS}
                  value={role}
                  onValueChange={(value) => setRole(value === 'KEEPER' ? 'KEEPER' : 'INVESTIGATOR')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INVESTIGATOR">Investigator</SelectItem>
                    <SelectItem value="KEEPER">Keeper</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <FormError>{error}</FormError>
            </DialogBody>

            <DialogFooter>
              <Button variant="ghost" onClick={() => reset(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="accent"
                disabled={isPending || (mode === 'personal' && noCandidates)}
              >
                <Link2 className="size-4" aria-hidden="true" />
                {isPending ? 'Creating…' : 'Create link'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
