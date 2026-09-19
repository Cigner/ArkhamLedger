'use client'

import { Plus } from 'lucide-react'
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
import type { CreationMethod } from '../domain/ruleset'
import { CreationMethodField } from './creation-method-field'
import { FormError } from '@/modules/identity/ui/form-error'
import { createInvestigator, linkInvestigatorToCampaign } from '../actions/investigators'

/**
 * A player brings a character to a campaign.
 *
 * One dialog for both cases, because from where the player is standing they are
 * the same intention: either the character already exists or it is about to.
 * Splitting them into two buttons would ask somebody to classify their own
 * intention before acting on it.
 */
export function LinkInvestigatorDialog({
  campaignId,
  available,
  ruleset,
}: {
  campaignId: string
  available: readonly {
    investigatorId: string
    name: string | null
    otherCampaigns: number
  }[]
  ruleset: { id: string; version: string; name: string }
}) {
  const t = useTranslations('investigators.link')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState<string>(available[0]?.investigatorId ?? 'new')
  const [name, setName] = useState('')
  const [method, setMethod] = useState<CreationMethod>('STANDARD_ROLLS')
  const [error, setError] = useState<string | null>(null)

  const messages = {
    'investigators.errors.alreadyLinked': t('errors.alreadyLinked'),
    'investigators.errors.archived': t('errors.archived'),
    'investigators.errors.deceased': t('errors.deceased'),
    'investigators.errors.notYours': t('errors.notYours'),
    'investigators.errors.nameRequired': t('errors.nameRequired'),
  }

  const done = () => {
    setOpen(false)
    setName('')
    router.refresh()
  }

  const fail = (actionError: {
    serverError?: { messageKey?: string | undefined } | undefined
    validationErrors?: unknown
  }) => {
    setError(
      resolveActionError(
        messages,
        t('errors.failed'),
        actionError.serverError?.messageKey,
        actionError.validationErrors,
      ),
    )
  }

  const create = useAction(createInvestigator, {
    onSuccess: done,
    onError: ({ error: actionError }) => fail(actionError),
  })
  const link = useAction(linkInvestigatorToCampaign, {
    onSuccess: done,
    onError: ({ error: actionError }) => fail(actionError),
  })

  const creatingNew = choice === 'new'
  const elsewhere = available.find((entry) => entry.investigatorId === choice)?.otherCampaigns ?? 0
  const pending = create.isPending || link.isPending

  const optionLabels: Record<string, string> = {
    new: t('newCharacter'),
    ...Object.fromEntries(
      available.map((entry) => [entry.investigatorId, entry.name ?? t('unnamed')]),
    ),
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="accent">
            <Plus className="size-4" aria-hidden="true" />
            {t('trigger')}
          </Button>
        }
      />
      <DialogContent className="max-w-md">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            setError(null)
            if (creatingNew) {
              create.execute({
                name,
                creationMethod: method,
                rulesetId: ruleset.id,
                rulesetVersion: ruleset.version,
                campaignId,
              })
            } else {
              link.execute({ investigatorId: choice, campaignId })
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>

          <DialogBody className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="choice">{t('which')}</FieldLabel>
              <Select value={choice} onValueChange={(value) => setChoice(String(value))}>
                <SelectTrigger id="choice">
                  <SelectValue placeholder={t('which')}>
                    {(value: string) => optionLabels[value] ?? ''}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {available.map((entry) => (
                    <SelectItem key={entry.investigatorId} value={entry.investigatorId}>
                      {entry.name ?? t('unnamed')}
                    </SelectItem>
                  ))}
                  <SelectItem value="new">{t('newCharacter')}</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {!creatingNew && elsewhere > 0 ? (
              <p className="rounded-sm border border-border-subtle bg-surface-raised p-3 font-ui text-sm text-text-secondary">
                {t('alsoPlayedElsewhere', { count: elsewhere })}
              </p>
            ) : null}

            {creatingNew ? <CreationMethodField value={method} onChange={setMethod} /> : null}

            {creatingNew ? (
              <Field>
                <FieldLabel htmlFor="name">{t('name')}</FieldLabel>
                <Input
                  id="name"
                  name="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={160}
                  required
                  autoFocus
                />
                <FieldDescription>{t('nameHint', { ruleset: ruleset.name })}</FieldDescription>
              </Field>
            ) : null}

            <FormError>{error}</FormError>
          </DialogBody>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              variant="accent"
              disabled={pending || (creatingNew && name.trim().length === 0)}
            >
              {pending ? t('adding') : t('confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
