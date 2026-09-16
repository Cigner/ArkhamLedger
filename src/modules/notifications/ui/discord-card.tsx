'use client'

import { Send, Trash2, Webhook } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
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
 * The URL is entered once and never shown again - it is a credential, and this
 * screen only ever reports whether one is stored. The test button exists because
 * the alternative way to discover a mistyped webhook is three days later, when
 * the channel stays silent about a session everybody was waiting on.
 */
export function DiscordCard({
  campaignId,
  status,
}: {
  campaignId: string
  status: IntegrationStatus
}) {
  const t = useTranslations('notifications.discord')
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
          {
            'notifications.errors.notADiscordWebhook': t('errors.invalid'),
            'notifications.errors.noWebhookConfigured': t('errors.missing'),
            'notifications.errors.webhookRejected': t('errors.rejected'),
            'errors.rateLimited': t('errors.rateLimited'),
          },
          fallback,
          failure.error.serverError?.messageKey,
          failure.error.validationErrors,
        ),
      )
    }

  const save = useAction(setDiscordWebhook, {
    onSuccess: () => router.refresh(),
    onError: handle(t('errors.save')),
  })

  const test = useAction(testDiscordWebhook, {
    onSuccess: () => {
      setTested(true)
      router.refresh()
    },
    onError: handle(t('errors.test')),
  })

  const remove = useAction(removeDiscordWebhook, {
    onSuccess: () => {
      setRemoving(false)
      router.refresh()
    },
    onError: handle(t('errors.remove')),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Webhook className="size-4 text-text-muted" aria-hidden="true" />
          {t('title')}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <p className="font-ui text-sm text-text-secondary">
          {status.configured ? t('configuredDescription') : t('description')}
        </p>

        {status.lastError ? (
          <p className="rounded-sm border border-status-danger/50 bg-sanguine-3 px-3 py-2 font-ui text-xs text-status-danger">
            {t('lastError', { error: status.lastError })}
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
            <FieldLabel htmlFor="url">{t('webhookLabel')}</FieldLabel>
            <Input
              id="url"
              name="url"
              type="url"
              required
              placeholder="https://discord.com/api/webhooks/…"
              autoComplete="off"
            />
            <FieldDescription>
              {status.configured ? t('webhookConfiguredHint') : t('webhookHint')}
            </FieldDescription>
          </Field>

          <FormError>{error}</FormError>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="accent" disabled={save.isPending}>
              {save.isPending ? t('saving') : status.configured ? t('replace') : t('save')}
            </Button>

            {status.configured ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={test.isPending}
                  onClick={() => {
                    setError(null)
                    test.execute({ campaignId })
                  }}
                >
                  <Send className="size-4" aria-hidden="true" />
                  {test.isPending ? t('posting') : t('test')}
                </Button>
                <Button type="button" variant="danger" onClick={() => setRemoving(true)}>
                  <Trash2 className="size-4" aria-hidden="true" />
                  {t('remove')}
                </Button>
              </>
            ) : null}

            {tested ? (
              <span role="status" className="font-ui text-xs text-status-positive">
                {t('posted')}
              </span>
            ) : null}
          </div>
        </form>
      </CardContent>

      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={t('removeDialog.title')}
        description={t('removeDialog.description')}
        confirmLabel={t('removeDialog.confirm')}
        destructive
        pending={remove.isPending}
        onConfirm={() => remove.execute({ campaignId })}
      />
    </Card>
  )
}
