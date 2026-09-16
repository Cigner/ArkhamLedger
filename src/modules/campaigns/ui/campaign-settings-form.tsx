'use client'

import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/patterns/confirm-dialog'
import { readString } from '@/lib/form-data'
import { resolveActionError } from '@/modules/identity/ui/action-errors'
import { FormError } from '@/modules/identity/ui/form-error'
import { archiveCampaignAction, transferOwnership, updateCampaign } from '../actions/campaign'
import type { CampaignMemberListItem, CampaignSettings, Membership } from '../domain/types'

/**
 * Campaign settings.
 *
 * Ownership transfer and archiving sit apart from the ordinary fields and behind
 * their own confirmation, because both change who can do what and neither is
 * undone by pressing back.
 */
export function CampaignSettingsForm({
  settings,
  members,
  viewer,
}: {
  settings: CampaignSettings
  members: readonly CampaignMemberListItem[]
  viewer: Membership
}) {
  const t = useTranslations('campaigns.settings')
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [status, setStatus] = useState(settings.status)
  const [confirmingArchive, setConfirmingArchive] = useState(false)
  const [confirmingTransfer, setConfirmingTransfer] = useState(false)
  const statusLabels = {
    PLANNING: t('statuses.PLANNING'),
    ACTIVE: t('statuses.ACTIVE'),
    ON_HIATUS: t('statuses.ON_HIATUS'),
    COMPLETED: t('statuses.COMPLETED'),
    ARCHIVED: t('statuses.ARCHIVED'),
  } as const
  const messages: Record<string, string> = {
    'campaigns.errors.invalidTimezone': t('errors.invalidTimezone'),
    'campaigns.errors.campaignArchived': t('errors.campaignArchived'),
    'campaigns.errors.newOwnerMustBeMember': t('errors.newOwnerMustBeMember'),
    'campaigns.errors.ownerOnly': t('errors.ownerOnly'),
  }

  const transferCandidates = members.filter((member) => member.userId !== viewer.userId)
  const [newOwnerId, setNewOwnerId] = useState(transferCandidates[0]?.userId ?? '')

  const save = useAction(updateCampaign, {
    onSuccess: () => {
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
    onError: ({ error: actionError }) => {
      setError(
        resolveActionError(
          messages,
          t('errors.saveFailed'),
          actionError.serverError?.messageKey,
          actionError.validationErrors,
        ),
      )
    },
  })

  const archive = useAction(archiveCampaignAction, {
    onSuccess: () => {
      router.push('/campaigns')
      router.refresh()
    },
    onSettled: () => setConfirmingArchive(false),
  })

  const transfer = useAction(transferOwnership, {
    onSuccess: () => router.refresh(),
    onSettled: () => setConfirmingTransfer(false),
  })

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const form = new FormData(event.currentTarget)
    save.execute({
      campaignId: settings.id,
      name: readString(form, 'name'),
      description: readString(form, 'description') || undefined,
      status,
      timezone: readString(form, 'timezone'),
    })
  }

  const ownerLabels = Object.fromEntries(
    transferCandidates.map((member) => [member.userId, member.name]),
  )

  const archived = settings.status === 'ARCHIVED'

  return (
    <div className="flex max-w-xl flex-col gap-10">
      {archived ? (
        <p
          role="status"
          className="rounded-sm border border-border-ornament bg-candle-3 px-3 py-2 font-ui text-sm leading-[--leading-ui] text-candle-11"
        >
          {t('archivedNotice')}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <Field>
          <FieldLabel htmlFor="name">{t('name')}</FieldLabel>
          <Input id="name" name="name" defaultValue={settings.name} required readOnly={archived} />
        </Field>

        <Field>
          <FieldLabel htmlFor="description">{t('description')}</FieldLabel>
          <Textarea
            id="description"
            name="description"
            defaultValue={settings.description ?? ''}
            readOnly={archived}
          />
        </Field>

        <Field>
          <FieldLabel>{t('status')}</FieldLabel>
          <Select
            items={statusLabels}
            value={status}
            onValueChange={(value) => setStatus(value as CampaignSettings['status'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(statusLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="timezone">{t('timezone')}</FieldLabel>
          <Input
            id="timezone"
            name="timezone"
            defaultValue={settings.timezone}
            required
            readOnly={archived}
          />
          <FieldDescription>{t('timezoneHint')}</FieldDescription>
        </Field>

        <FormError>{error}</FormError>

        <div className="flex items-center gap-3">
          <Button type="submit" variant="accent" disabled={save.isPending}>
            <Check className="size-4" aria-hidden="true" />
            {save.isPending ? t('saving') : t('saveChanges')}
          </Button>
          {saved ? (
            <span role="status" className="font-ui text-xs text-status-positive">
              {t('saved')}
            </span>
          ) : null}
        </div>
      </form>

      {viewer.isOwner ? (
        <section className="flex flex-col gap-5 border-t border-border-subtle pt-8">
          <h2 className="font-display text-lg tracking-[--tracking-display] text-text-primary">
            {t('ownership')}
          </h2>

          {transferCandidates.length > 0 ? (
            <Field>
              <FieldLabel>{t('transferTo')}</FieldLabel>
              <Select
                items={ownerLabels}
                value={newOwnerId}
                onValueChange={(value) => setNewOwnerId(String(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {transferCandidates.map((member) => (
                    <SelectItem key={member.userId} value={member.userId}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>{t('transferHint')}</FieldDescription>
              <div className="mt-2">
                <Button variant="outline" onClick={() => setConfirmingTransfer(true)}>
                  {t('transferOwnership')}
                </Button>
              </div>
            </Field>
          ) : (
            <p className="font-ui text-sm text-text-muted">{t('noTransferCandidates')}</p>
          )}

          <div className="flex flex-col gap-2 border-t border-border-subtle pt-6">
            <h3 className="font-ui text-sm font-medium text-text-primary">{t('archive')}</h3>
            <p className="font-ui text-sm text-text-secondary">{t('archiveHint')}</p>
            <div className="mt-1">
              <Button
                variant="danger"
                disabled={archived}
                onClick={() => setConfirmingArchive(true)}
              >
                {archived ? t('alreadyArchived') : t('archiveCampaign')}
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <ConfirmDialog
        open={confirmingTransfer}
        onOpenChange={setConfirmingTransfer}
        title={t('transferConfirmTitle')}
        description={t('transferConfirmDescription')}
        confirmLabel={t('transferOwnership')}
        pending={transfer.isPending}
        onConfirm={() => transfer.execute({ campaignId: settings.id, newOwnerId })}
      />

      <ConfirmDialog
        open={confirmingArchive}
        onOpenChange={setConfirmingArchive}
        title={t('archiveConfirmTitle')}
        description={t('archiveConfirmDescription')}
        confirmLabel={t('archiveCampaign')}
        destructive
        pending={archive.isPending}
        onConfirm={() => archive.execute({ campaignId: settings.id })}
      />
    </div>
  )
}
