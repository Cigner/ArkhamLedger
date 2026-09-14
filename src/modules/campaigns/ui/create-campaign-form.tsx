'use client'

import { Check } from 'lucide-react'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { readString } from '@/lib/form-data'
import { resolveActionError } from '@/modules/identity/ui/action-errors'
import { FormError } from '@/modules/identity/ui/form-error'
import { createCampaign } from '../actions/campaign'

/**
 * Creates a campaign and drops the creator into it.
 *
 * The creator becomes its owner and Keeper in the same transaction, so there is
 * no intermediate state where a campaign exists without anybody able to open it.
 */
const MESSAGES: Record<string, string> = {
  'campaigns.errors.invalidTimezone': 'That is not a recognised time zone.',
}

export function CreateCampaignForm() {
  const router = useRouter()
  const [navigating, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const { execute, isPending } = useAction(createCampaign, {
    onSuccess: ({ data }) => {
      if (!data) return
      startTransition(() => {
        router.push(`/campaigns/${data.campaignId}`)
        router.refresh()
      })
    },
    onError: ({ error: actionError }) => {
      setError(
        resolveActionError(
          MESSAGES,
          'Could not create the campaign.',
          actionError.serverError?.messageKey,
          actionError.validationErrors,
        ),
      )
    },
  })

  const busy = isPending || navigating

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const form = new FormData(event.currentTarget)
    execute({
      name: readString(form, 'name'),
      description: readString(form, 'description') || undefined,
      scenarioName: readString(form, 'scenarioName') || undefined,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-5" noValidate>
      <Field>
        <FieldLabel htmlFor="name">Name</FieldLabel>
        <Input id="name" name="name" required autoFocus disabled={busy} />
      </Field>

      <Field>
        <FieldLabel htmlFor="description">Description</FieldLabel>
        <Textarea id="description" name="description" disabled={busy} />
        <FieldDescription>Visible to everyone you invite.</FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="scenarioName">Scenario</FieldLabel>
        <Input id="scenarioName" name="scenarioName" disabled={busy} />
        <FieldDescription>Optional. You can add or change this later.</FieldDescription>
      </Field>

      <FormError>{error}</FormError>

      <div className="flex items-center gap-2">
        <Button type="submit" variant="accent" disabled={busy}>
          <Check className="size-4" aria-hidden="true" />
          {busy ? 'Creating…' : 'Create campaign'}
        </Button>
        <Button variant="ghost" onClick={() => router.push('/campaigns')} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
