'use client'

import { ScrollText } from 'lucide-react'
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
import { createInvestigatorForPlayer } from '../actions/investigators'

/**
 * A Keeper starts a character for one of their players.
 *
 * Only a name and a player here. Everything else belongs on the sheet the owner
 * is about to open, and asking a Keeper to fill in somebody else's
 * characteristics before that person has seen it is the wrong order.
 */
export function CreateForPlayerDialog({
  campaignId,
  players,
  ruleset,
}: {
  campaignId: string
  players: readonly { userId: string; name: string }[]
  ruleset: { id: string; version: string; name: string }
}) {
  const t = useTranslations('investigators.createForPlayer')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [playerId, setPlayerId] = useState(players[0]?.userId ?? '')
  const [name, setName] = useState('')
  const [method, setMethod] = useState<CreationMethod>('STANDARD_ROLLS')
  const [error, setError] = useState<string | null>(null)

  const { execute, isPending } = useAction(createInvestigatorForPlayer, {
    onSuccess: () => {
      setOpen(false)
      setName('')
      router.refresh()
    },
    onError: ({ error: actionError }) => {
      setError(
        resolveActionError(
          {
            'investigators.errors.playerNotInCampaign': t('errors.notInCampaign'),
            'investigators.errors.nameRequired': t('errors.nameRequired'),
          },
          t('errors.failed'),
          actionError.serverError?.messageKey,
          actionError.validationErrors,
        ),
      )
    },
  })

  const playerLabels = Object.fromEntries(players.map((player) => [player.userId, player.name]))

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="accent" disabled={players.length === 0}>
            <ScrollText className="size-4" aria-hidden="true" />
            {t('trigger')}
          </Button>
        }
      />
      <DialogContent className="max-w-md">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            setError(null)
            execute({
              campaignId,
              playerId,
              name,
              creationMethod: method,
              rulesetId: ruleset.id,
              rulesetVersion: ruleset.version,
            })
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>

          <DialogBody className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="playerId">{t('player')}</FieldLabel>
              <Select value={playerId} onValueChange={(value) => setPlayerId(String(value))}>
                <SelectTrigger id="playerId">
                  <SelectValue placeholder={t('player')}>
                    {(value: string) => playerLabels[value] ?? ''}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {players.map((player) => (
                    <SelectItem key={player.userId} value={player.userId}>
                      {player.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>{t('playerHint')}</FieldDescription>
            </Field>

            <CreationMethodField value={method} onChange={setMethod} />

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

            <FormError>{error}</FormError>
          </DialogBody>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant="accent" disabled={isPending || name.trim().length === 0}>
              {isPending ? t('creating') : t('confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
