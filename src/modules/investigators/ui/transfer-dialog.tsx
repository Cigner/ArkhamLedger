'use client'

import { ArrowLeftRight } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { IconButton } from '@/components/patterns/icon-button'
import { resolveActionError } from '@/modules/identity/ui/action-errors'
import { FormError } from '@/modules/identity/ui/form-error'
import { requestInvestigatorTransfer } from '../actions/transfers'

/**
 * Asking a player to hand their character to somebody else.
 *
 * A request rather than an action, and the dialog says so: the Keeper writes
 * why, the owner decides. Pretending otherwise - a button that simply moves the
 * character - would be the one place in this feature where something is taken
 * rather than given.
 */
export function TransferDialog({
  campaignId,
  investigatorId,
  investigatorName,
  candidates,
}: {
  campaignId: string
  investigatorId: string
  investigatorName: string | null
  candidates: readonly { userId: string; name: string }[]
}) {
  const t = useTranslations('investigators.transfer')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [toOwnerId, setToOwnerId] = useState(candidates[0]?.userId ?? '')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const request = useAction(requestInvestigatorTransfer, {
    onSuccess: () => {
      setOpen(false)
      setReason('')
      router.refresh()
    },
    onError: ({ error: actionError }) => {
      setError(
        resolveActionError(
          {
            'investigators.errors.transferAlreadyPending': t('errors.alreadyPending'),
            'investigators.errors.newOwnerNotInCampaign': t('errors.notInCampaign'),
            'investigators.errors.alreadyTheirs': t('errors.alreadyTheirs'),
            'investigators.errors.archived': t('errors.archived'),
          },
          t('errors.failed'),
          actionError.serverError?.messageKey,
          actionError.validationErrors,
        ),
      )
    },
  })

  const labels = Object.fromEntries(candidates.map((entry) => [entry.userId, entry.name]))

  return (
    <>
      <IconButton
        label={t('trigger')}
        variant="ghost"
        icon={<ArrowLeftRight className="size-4" aria-hidden="true" />}
        onClick={() => setOpen(true)}
        disabled={candidates.length === 0}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              setError(null)
              request.execute({
                campaignId,
                investigatorId,
                toOwnerId,
                reason: reason || null,
              })
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {t('title', { investigator: investigatorName ?? t('unnamed') })}
              </DialogTitle>
              <DialogDescription>{t('description')}</DialogDescription>
            </DialogHeader>

            <DialogBody className="flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor="transfer-to">{t('to')}</FieldLabel>
                <Select value={toOwnerId} onValueChange={(value) => setToOwnerId(String(value))}>
                  <SelectTrigger id="transfer-to">
                    <SelectValue placeholder={t('to')}>
                      {(value: string) => labels[value] ?? ''}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((entry) => (
                      <SelectItem key={entry.userId} value={entry.userId}>
                        {entry.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel htmlFor="transfer-reason">{t('reason')}</FieldLabel>
                <Textarea
                  id="transfer-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={500}
                />
                <FieldDescription>{t('reasonHint')}</FieldDescription>
              </Field>

              <FormError>{error}</FormError>
            </DialogBody>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" variant="accent" disabled={request.isPending || !toOwnerId}>
                {request.isPending ? t('asking') : t('confirm')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
