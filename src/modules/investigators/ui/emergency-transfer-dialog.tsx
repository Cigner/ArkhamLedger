'use client'

import { TriangleAlert } from 'lucide-react'
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
import { resolveActionError } from '@/modules/identity/ui/action-errors'
import { FormError } from '@/modules/identity/ui/form-error'
import { emergencyTransfer } from '../actions/emergency'

/**
 * Moving a character without asking its owner.
 *
 * Deliberately uncomfortable. The dialog says plainly that consent is being
 * overridden, the reason is required and has to be a sentence, and the button
 * is a danger button - because the only defensible use of this is one somebody
 * is prepared to explain afterwards.
 */
export function EmergencyTransferDialog({
  campaignId,
  investigatorId,
  investigatorName,
  ownerName,
  candidates,
}: {
  campaignId: string
  investigatorId: string
  investigatorName: string | null
  ownerName: string
  candidates: readonly { userId: string; name: string }[]
}) {
  const t = useTranslations('admin.emergencyTransfer')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [toOwnerId, setToOwnerId] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const run = useAction(emergencyTransfer, {
    onSuccess: () => {
      setOpen(false)
      setReason('')
      router.refresh()
    },
    onError: ({ error: actionError }) => {
      setError(
        resolveActionError(
          {
            'investigators.errors.alreadyTheirs': t('errors.alreadyTheirs'),
            'investigators.errors.newOwnerNotInCampaign': t('errors.notInCampaign'),
            'investigators.errors.reasonRequired': t('errors.reasonRequired'),
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
      <Button variant="danger" onClick={() => setOpen(true)} disabled={candidates.length === 0}>
        <TriangleAlert className="size-4" aria-hidden="true" />
        {t('trigger')}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              setError(null)
              run.execute({ campaignId, investigatorId, toOwnerId, reason })
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {t('title', { investigator: investigatorName ?? t('unnamed') })}
              </DialogTitle>
              <DialogDescription>{t('description', { owner: ownerName })}</DialogDescription>
            </DialogHeader>

            <DialogBody className="flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor="emergency-to">{t('to')}</FieldLabel>
                <Select value={toOwnerId} onValueChange={(value) => setToOwnerId(String(value))}>
                  <SelectTrigger id="emergency-to">
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
                <FieldLabel htmlFor="emergency-reason">{t('reason')}</FieldLabel>
                <Textarea
                  id="emergency-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={500}
                  rows={3}
                  required
                />
                <FieldDescription>{t('reasonHint')}</FieldDescription>
              </Field>

              <FormError>{error}</FormError>
            </DialogBody>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {t('cancel')}
              </Button>
              <Button
                type="submit"
                variant="danger"
                disabled={run.isPending || !toOwnerId || reason.trim().length < 10}
              >
                {run.isPending ? t('moving') : t('confirm')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
