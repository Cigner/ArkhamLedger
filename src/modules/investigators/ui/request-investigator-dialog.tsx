'use client'

import { HandHeart } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FormError } from '@/modules/identity/ui/form-error'
import { resolveActionError } from '@/modules/identity/ui/action-errors'
import { requestInvestigatorForCampaign } from '../actions/investigators'

/**
 * A Keeper asks for somebody else's character.
 *
 * Deliberately an invitation rather than an action: nothing about the character
 * changes here, and the owner is the one who decides. The campaign list is
 * built on the server from campaigns the Keeper runs and the owner is already
 * in, so there is nothing to validate on this side and nothing about the owner
 * to leak into it.
 */
export function RequestInvestigatorDialog({
  investigatorId,
  campaigns,
}: {
  investigatorId: string
  campaigns: readonly { campaignId: string; name: string }[]
}) {
  const t = useTranslations('investigators.request')
  const [open, setOpen] = useState(false)
  const [campaignId, setCampaignId] = useState(campaigns[0]?.campaignId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const ask = useAction(requestInvestigatorForCampaign, {
    onSuccess: () => {
      setSent(true)
      setOpen(false)
    },
    onError: ({ error: actionError }) =>
      setError(
        resolveActionError(
          { 'investigators.errors.cannotRequest': t('errors.cannotRequest') },
          t('errors.failed'),
          actionError.serverError?.messageKey,
          actionError.validationErrors,
        ),
      ),
  })

  const labels = Object.fromEntries(campaigns.map((entry) => [entry.campaignId, entry.name]))

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" disabled={sent}>
            <HandHeart className="size-4" aria-hidden="true" />
            {sent ? t('sent') : t('trigger')}
          </Button>
        }
      />
      <DialogContent className="max-w-md">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            setError(null)
            ask.execute({ investigatorId, campaignId })
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>

          <DialogBody className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="request-campaign">{t('campaign')}</FieldLabel>
              <Select value={campaignId} onValueChange={(value) => setCampaignId(String(value))}>
                <SelectTrigger id="request-campaign">
                  <SelectValue placeholder={t('campaign')}>
                    {(value: string) => labels[value] ?? ''}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map((entry) => (
                    <SelectItem key={entry.campaignId} value={entry.campaignId}>
                      {entry.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>{t('hint')}</FieldDescription>
            </Field>

            <FormError>{error}</FormError>
          </DialogBody>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant="accent" disabled={ask.isPending || campaignId === ''}>
              {t('send')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
