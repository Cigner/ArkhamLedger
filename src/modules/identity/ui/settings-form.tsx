'use client'

import { Bell, Check, KeyRound, UserRound } from 'lucide-react'
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
const MESSAGES: Record<string, string> = {
  'identity.errors.invalidTimezone': 'That is not a time zone this application recognises.',
  'identity.errors.passwordsDoNotMatch': 'The two passwords do not match.',
  'identity.errors.passwordTooCommon':
    'That password appears on lists of the most common ones. Choose another.',
  'errors.unauthorized': 'Your current password is not right.',
}

export function SettingsForm({
  profile,
  emailNotifications,
}: {
  profile: { name: string; timezone: string; email: string }
  emailNotifications: boolean
}) {
  const router = useRouter()
  const [profileError, setProfileError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [saved, setSaved] = useState<'profile' | 'password' | 'channel' | null>(null)

  const save = useAction(updateProfile, {
    onSuccess: () => {
      setSaved('profile')
      router.refresh()
    },
    onError: ({ error }) =>
      setProfileError(
        resolveActionError(
          MESSAGES,
          'Could not save your details.',
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
          MESSAGES,
          'Could not change your password.',
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
            You
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
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input id="name" name="name" defaultValue={profile.name} required maxLength={120} />
              <FieldDescription>How you appear to the rest of your campaigns.</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="timezone">Time zone</FieldLabel>
              <Input
                id="timezone"
                name="timezone"
                defaultValue={profile.timezone}
                required
                maxLength={64}
              />
              <FieldDescription>
                An IANA name such as Europe/Warsaw. Sessions always show the campaign&rsquo;s zone;
                this one is for your own reminders.
              </FieldDescription>
            </Field>

            <FormError>{profileError}</FormError>

            <div className="flex items-center gap-3">
              <Button type="submit" variant="accent" disabled={save.isPending}>
                <Check className="size-4" aria-hidden="true" />
                {save.isPending ? 'Saving…' : 'Save'}
              </Button>
              {saved === 'profile' ? (
                <span role="status" className="font-ui text-xs text-status-positive">
                  Saved.
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
            Notifications
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
              <span className="font-ui text-sm text-text-primary">Email me</span>
              <span className="font-ui text-xs text-text-muted">
                Invitations, availability requests and confirmed dates. Sent to {profile.email}.
              </span>
            </span>
          </label>

          {/*
            In-app has no switch: the notification is the record of what happened,
            and turning it off would leave somebody unable to find out at all.
          */}
          <p className="font-ui text-xs text-text-muted">
            Everything is kept here whether or not it is emailed.
          </p>

          {saved === 'channel' ? (
            <span role="status" className="font-ui text-xs text-status-positive">
              Saved.
            </span>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-text-muted" aria-hidden="true" />
            Password
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
              <FieldLabel htmlFor="currentPassword">Current password</FieldLabel>
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
                {password.isPending ? 'Changing…' : 'Change password'}
              </Button>
              {saved === 'password' ? (
                <span role="status" className="font-ui text-xs text-status-positive">
                  Changed. Every other signed-in device has been signed out.
                </span>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
