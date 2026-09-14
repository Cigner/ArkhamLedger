'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/patterns/confirm-dialog'
import { readString } from '@/lib/form-data'
import { resolveActionError } from '@/modules/identity/ui/action-errors'
import { FormError } from '@/modules/identity/ui/form-error'
import {
  removeDiscordWebhook,
  setDiscordWebhook,
  testDiscordWebhook,
} from '../actions/notifications'
import type { IntegrationStatus } from '../data/integrations'

/**
 * Connecting a campaign to its Discord channel.
 *
 * The URL is entered once and never shown again — it is a credential, and this
 * screen only ever reports whether one is stored. The test button exists because
 * the alternative way to discover a mistyped webhook is three days later, when
 * the channel stays silent about a session everybody was waiting on.
 */
const MESSAGES: Record<string, string> = {
  'notifications.errors.notADiscordWebhook':
    'That is not a Discord webhook address. Copy it from the channel’s integration settings.',
  'notifications.errors.noWebhookConfigured': 'There is nothing to test yet.',
  'notifications.errors.webhookRejected':
    'Discord refused the message. The webhook may have been deleted.',
  'errors.rateLimited': 'That has been tested a lot recently. Give it a few minutes.',
}

export function DiscordCard({
  campaignId,
  status,
}: {
  campaignId: string
  status: IntegrationStatus
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [tested, setTested] = useState(false)
  const [removing, setRemoving] = useState(false)

  const handle =
    (fallback: string) =>
    (failure: {
      error: {
        serverError?: { messageKey?: string | undefined } | undefined
        validationErrors?: unknown
      }
    }) => {
      setTested(false)
      setError(
        resolveActionError(
          MESSAGES,
          fallback,
          failure.error.serverError?.messageKey,
          failure.error.validationErrors,
        ),
      )
    }

  const save = useAction(setDiscordWebhook, {
    onSuccess: () => router.refresh(),
    onError: handle('Could not save that webhook.'),
  })

  const test = useAction(testDiscordWebhook, {
    onSuccess: () => {
      setTested(true)
      router.refresh()
    },
    onError: handle('Could not post to that channel.'),
  })

  const remove = useAction(removeDiscordWebhook, {
    onSuccess: () => {
      setRemoving(false)
      router.refresh()
    },
    onError: handle('Could not remove that webhook.'),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Discord</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <p className="font-ui text-sm text-text-secondary">
          {status.configured
            ? 'This campaign posts to a Discord channel when a session is announced, confirmed, moved or cancelled.'
            : 'Paste a channel webhook to have the group told in Discord as well as by email.'}
        </p>

        {status.lastError ? (
          <p className="rounded-sm border border-status-danger/50 bg-sanguine-3 px-3 py-2 font-ui text-xs text-status-danger">
            The last post was refused: {status.lastError}
          </p>
        ) : null}

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            setError(null)
            setTested(false)
            const form = new FormData(event.currentTarget)
            save.execute({ campaignId, url: readString(form, 'url') })
            event.currentTarget.reset()
          }}
        >
          <Field>
            <FieldLabel htmlFor="url">Webhook address</FieldLabel>
            <Input
              id="url"
              name="url"
              type="url"
              required
              placeholder="https://discord.com/api/webhooks/…"
              autoComplete="off"
            />
            <FieldDescription>
              {status.configured
                ? 'One is already stored. Entering another replaces it; it is never shown again.'
                : 'Channel settings → Integrations → Webhooks → Copy webhook URL.'}
            </FieldDescription>
          </Field>

          <FormError>{error}</FormError>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="accent" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : status.configured ? 'Replace webhook' : 'Save webhook'}
            </Button>

            {status.configured ? (
              <>
                <Button
                  variant="outline"
                  disabled={test.isPending}
                  onClick={() => {
                    setError(null)
                    test.execute({ campaignId })
                  }}
                >
                  {test.isPending ? 'Posting…' : 'Send a test post'}
                </Button>
                <Button variant="danger" onClick={() => setRemoving(true)}>
                  Remove
                </Button>
              </>
            ) : null}

            {tested ? (
              <span role="status" className="font-ui text-xs text-status-positive">
                Posted. Check the channel.
              </span>
            ) : null}
          </div>
        </form>
      </CardContent>

      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title="Stop posting to Discord?"
        description="Nothing from this campaign will be posted to the channel afterwards. Email and in-app notifications are unaffected."
        confirmLabel="Remove webhook"
        destructive
        pending={remove.isPending}
        onConfirm={() => remove.execute({ campaignId })}
      />
    </Card>
  )
}
