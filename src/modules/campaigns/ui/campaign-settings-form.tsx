'use client'

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
const STATUS_LABELS = {
  PLANNING: 'Planning',
  ACTIVE: 'Active',
  ON_HIATUS: 'On hiatus',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
} as const

const MESSAGES: Record<string, string> = {
  'campaigns.errors.invalidTimezone': 'That is not a recognised time zone.',
  'campaigns.errors.campaignArchived': 'This campaign is archived and cannot be changed.',
  'campaigns.errors.newOwnerMustBeMember': 'The new owner has to be an active member.',
  'campaigns.errors.ownerOnly': 'Only the campaign owner can do that.',
}

export function CampaignSettingsForm({
  settings,
  members,
  viewer,
}: {
  settings: CampaignSettings
  members: readonly CampaignMemberListItem[]
  viewer: Membership
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [status, setStatus] = useState(settings.status)
  const [confirmingArchive, setConfirmingArchive] = useState(false)
  const [confirmingTransfer, setConfirmingTransfer] = useState(false)

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
          MESSAGES,
          'Could not save the campaign.',
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

  return (
    <div className="flex max-w-xl flex-col gap-10">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <Field>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input id="name" name="name" defaultValue={settings.name} required />
        </Field>

        <Field>
          <FieldLabel htmlFor="description">Description</FieldLabel>
          <Textarea id="description" name="description" defaultValue={settings.description ?? ''} />
        </Field>

        <Field>
          <FieldLabel>Status</FieldLabel>
          <Select
            items={STATUS_LABELS}
            value={status}
            onValueChange={(value) => setStatus(value as CampaignSettings['status'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="timezone">Time zone</FieldLabel>
          <Input id="timezone" name="timezone" defaultValue={settings.timezone} required />
          <FieldDescription>
            An IANA identifier such as Europe/Warsaw. The availability grid is drawn in this zone
            for every member, so that everyone is looking at the same hours.
          </FieldDescription>
        </Field>

        <FormError>{error}</FormError>

        <div className="flex items-center gap-3">
          <Button type="submit" variant="accent" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save changes'}
          </Button>
          {saved ? (
            <span role="status" className="font-ui text-xs text-status-positive">
              Saved
            </span>
          ) : null}
        </div>
      </form>

      {viewer.isOwner ? (
        <section className="flex flex-col gap-5 border-t border-border-subtle pt-8">
          <h2 className="font-display text-lg tracking-[--tracking-display] text-text-primary">
            Ownership
          </h2>

          {transferCandidates.length > 0 ? (
            <Field>
              <FieldLabel>Transfer to</FieldLabel>
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
              <FieldDescription>
                They become the owner and a Keeper. You stay a Keeper and can then leave if you
                want to.
              </FieldDescription>
              <div className="mt-2">
                <Button variant="outline" onClick={() => setConfirmingTransfer(true)}>
                  Transfer ownership
                </Button>
              </div>
            </Field>
          ) : (
            <p className="font-ui text-sm text-text-muted">
              Invite somebody else before you can hand the campaign over.
            </p>
          )}

          <div className="flex flex-col gap-2 border-t border-border-subtle pt-6">
            <h3 className="font-ui text-sm font-medium text-text-primary">Archive</h3>
            <p className="font-ui text-sm text-text-secondary">
              Hides the campaign and makes it read-only. Sessions and availability are kept.
            </p>
            <div className="mt-1">
              <Button variant="danger" onClick={() => setConfirmingArchive(true)}>
                Archive campaign
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <ConfirmDialog
        open={confirmingTransfer}
        onOpenChange={setConfirmingTransfer}
        title="Hand over this campaign?"
        description="They become the owner and can archive it, manage membership and change roles — including yours. You cannot take it back yourself."
        confirmLabel="Transfer ownership"
        pending={transfer.isPending}
        onConfirm={() => transfer.execute({ campaignId: settings.id, newOwnerId })}
      />

      <ConfirmDialog
        open={confirmingArchive}
        onOpenChange={setConfirmingArchive}
        title="Archive this campaign?"
        description="It disappears from everyone's list and becomes read-only. Nothing is deleted."
        confirmLabel="Archive campaign"
        destructive
        pending={archive.isPending}
        onConfirm={() => archive.execute({ campaignId: settings.id })}
      />
    </div>
  )
}
