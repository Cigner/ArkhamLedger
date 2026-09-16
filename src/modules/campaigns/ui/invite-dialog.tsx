'use client'

import { Link2, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { useTranslations } from 'next-intl'
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
export function InviteDialog({
  campaignId,
  invitableUsers,
}: {
  campaignId: string
  invitableUsers: readonly { id: string; name: string; email: string; pending: boolean }[]
}) {
  const t = useTranslations('campaigns.inviteDialog')
  const modeLabels = { personal: t('personal'), shared: t('shared') }
  const roleLabels = { INVESTIGATOR: t('investigator'), KEEPER: t('keeper') }
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
          {
            'campaigns.errors.alreadyAMember': t('errors.alreadyMember'),
            'campaigns.errors.campaignArchived': t('errors.archived'),
            'campaigns.errors.personalInvitationMustBeSingleUse': t('errors.personalSingleUse'),
          },
          t('errors.failed'),
          actionError.serverError?.messageKey,
          actionError.validationErrors,
        ),
      )
    },
  })

  const userLabels = Object.fromEntries(
    invitableUsers.map((user) => [
      user.id,
      user.pending ? t('pendingUser', { name: user.name }) : user.name,
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
        {t('trigger')}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{issued ? t('readyTitle') : t('title')}</DialogTitle>
          <DialogDescription>{issued ? t('readyDescription') : t('description')}</DialogDescription>
        </DialogHeader>

        {issued ? (
          <>
            <DialogBody>
              <ActivationLinkPanel url={issued.url} expiresAt={issued.expiresAt} />
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => reset(false)}>
                {t('done')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogBody className="flex flex-col gap-4">
              <Field>
                <FieldLabel>{t('modeLabel')}</FieldLabel>
                <Select
                  items={modeLabels}
                  value={mode}
                  onValueChange={(value) => setMode(value === 'shared' ? 'shared' : 'personal')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">{modeLabels.personal}</SelectItem>
                    <SelectItem value="shared">{modeLabels.shared}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              {mode === 'personal' ? (
                <Field>
                  <FieldLabel>{t('person')}</FieldLabel>
                  {noCandidates ? (
                    <p className="font-ui text-sm text-text-muted">{t('noCandidates')}</p>
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
                                {t('notActivated')}
                              </span>
                            ) : null}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <FieldDescription>{t('personalHint')}</FieldDescription>
                </Field>
              ) : (
                <Field>
                  <FieldLabel htmlFor="maxUses">{t('maxUses')}</FieldLabel>
                  <Input
                    id="maxUses"
                    type="number"
                    min={1}
                    max={50}
                    value={maxUses}
                    onChange={(event) => setMaxUses(event.target.value)}
                    disabled={isPending}
                  />
                  <FieldDescription>{t('maxUsesHint')}</FieldDescription>
                </Field>
              )}

              <Field>
                <FieldLabel>{t('roleLabel')}</FieldLabel>
                <Select
                  items={roleLabels}
                  value={role}
                  onValueChange={(value) => setRole(value === 'KEEPER' ? 'KEEPER' : 'INVESTIGATOR')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INVESTIGATOR">{roleLabels.INVESTIGATOR}</SelectItem>
                    <SelectItem value="KEEPER">{roleLabels.KEEPER}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <FormError>{error}</FormError>
            </DialogBody>

            <DialogFooter>
              <Button variant="ghost" onClick={() => reset(false)} disabled={isPending}>
                {t('cancel')}
              </Button>
              <Button
                type="submit"
                variant="accent"
                disabled={isPending || (mode === 'personal' && noCandidates)}
              >
                <Link2 className="size-4" aria-hidden="true" />
                {isPending ? t('creating') : t('submit')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
