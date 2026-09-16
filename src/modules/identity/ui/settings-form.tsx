'use client'

import { Bell, Check, KeyRound, UserRound } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { readString } from '@/lib/form-data'
import { setNotificationChannel } from '@/modules/notifications/actions/notifications'
import { changePassword, updateProfile } from '../actions/profile'
import { resolveActionError } from './action-errors'
import { FormError } from './form-error'
import { PasswordFields } from './password-fields'

/**
 * Everything a person can change about their own account.
 *
 * Three separate submissions rather than one: they fail for unrelated reasons
 * and a single Save that reports "something was wrong" would leave the user
 * hunting for which of three things it meant.
 */
export function SettingsForm({
  profile,
  emailNotifications,
}: {
  profile: { name: string; timezone: string; email: string }
  emailNotifications: boolean
}) {
  const t = useTranslations('identity.settings')
  const router = useRouter()
  const [profileError, setProfileError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [saved, setSaved] = useState<'profile' | 'password' | 'channel' | null>(null)
  const messages: Record<string, string> = {
    'identity.errors.invalidTimezone': t('errors.invalidTimezone'),
    'identity.errors.passwordsDoNotMatch': t('errors.passwordMismatch'),
    'identity.errors.passwordTooCommon': t('errors.passwordCommon'),
    'errors.unauthorized': t('errors.currentPassword'),
  }

  const save = useAction(updateProfile, {
    onSuccess: () => {
      setSaved('profile')
      router.refresh()
    },
    onError: ({ error }) =>
      setProfileError(
        resolveActionError(
          messages,
          t('errors.profileSave'),
          error.serverError?.messageKey,
          error.validationErrors,
        ),
      ),
  })

  const password = useAction(changePassword, {
    onSuccess: () => setSaved('password'),
    onError: ({ error }) =>
      setPasswordError(
        resolveActionError(
          messages,
          t('errors.passwordChange'),
          error.serverError?.messageKey,
          error.validationErrors,
        ),
      ),
  })

  const channel = useAction(setNotificationChannel, {
    onSuccess: () => {
      setSaved('channel')
      router.refresh()
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserRound className="size-4 text-text-muted" aria-hidden="true" />
            {t('you')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              setProfileError(null)
              const form = new FormData(event.currentTarget)
              save.execute({
                name: readString(form, 'name'),
                timezone: readString(form, 'timezone'),
                locale: 'en',
              })
            }}
          >
            <Field>
              <FieldLabel htmlFor="name">{t('name')}</FieldLabel>
              <Input id="name" name="name" defaultValue={profile.name} required maxLength={120} />
              <FieldDescription>{t('nameHint')}</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="timezone">{t('timezone')}</FieldLabel>
              <Input
                id="timezone"
                name="timezone"
                defaultValue={profile.timezone}
                required
                maxLength={64}
              />
              <FieldDescription>{t('timezoneHint')}</FieldDescription>
            </Field>

            <FormError>{profileError}</FormError>

            <div className="flex items-center gap-3">
              <Button type="submit" variant="accent" disabled={save.isPending}>
                <Check className="size-4" aria-hidden="true" />
                {save.isPending ? t('saving') : t('save')}
              </Button>
              {saved === 'profile' ? (
                <span role="status" className="font-ui text-xs text-status-positive">
                  {t('saved')}
                </span>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="size-4 text-text-muted" aria-hidden="true" />
            {t('notifications')}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <label className="flex items-start gap-3">
            <Checkbox
              checked={emailNotifications}
              disabled={channel.isPending}
              onCheckedChange={(checked) =>
                channel.execute({ channel: 'EMAIL', enabled: checked === true })
              }
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-ui text-sm text-text-primary">{t('emailMe')}</span>
              <span className="font-ui text-xs text-text-muted">
                {t('emailHint', { email: profile.email })}
              </span>
            </span>
          </label>

          {/*
            In-app has no switch: the notification is the record of what happened,
            and turning it off would leave somebody unable to find out at all.
          */}
          <p className="font-ui text-xs text-text-muted">{t('inAppHint')}</p>

          {saved === 'channel' ? (
            <span role="status" className="font-ui text-xs text-status-positive">
              {t('saved')}
            </span>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-text-muted" aria-hidden="true" />
            {t('password')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              setPasswordError(null)
              const form = new FormData(event.currentTarget)
              password.execute({
                currentPassword: readString(form, 'currentPassword'),
                password: readString(form, 'password'),
                confirmPassword: readString(form, 'confirmPassword'),
              })
              event.currentTarget.reset()
            }}
          >
            <Field>
              <FieldLabel htmlFor="currentPassword">{t('currentPassword')}</FieldLabel>
              <Input
                id="currentPassword"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>

            <PasswordFields disabled={password.isPending} />

            <FormError>{passwordError}</FormError>

            <div className="flex items-center gap-3">
              <Button type="submit" variant="accent" disabled={password.isPending}>
                {password.isPending ? t('changing') : t('changePassword')}
              </Button>
              {saved === 'password' ? (
                <span role="status" className="font-ui text-xs text-status-positive">
                  {t('passwordChanged')}
                </span>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
