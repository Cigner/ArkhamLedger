'use client'

import { Plus, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useAction } from 'next-safe-action/hooks'
import { Button } from '@/components/ui/button'
import { readString } from '@/lib/form-data'
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
import { createUser } from '../../actions/admin'
import { resolveActionError } from '../action-errors'
import { FormError } from '../form-error'
import { ActivationLinkPanel } from './activation-link-panel'

/**
 * Creates an account and surfaces its activation link.
 *
 * The link is shown once, in the dialog, and is never emailed: the administrator
 * passes it to the person through whatever channel the group already uses. That
 * keeps a home mail relay off the critical path for the very first credential.
 */
export function CreateUserDialog() {
  const t = useTranslations()
  const roleLabels = {
    user: t('admin.users.roles.user'),
    admin: t('admin.users.roles.admin'),
  }
  const [open, setOpen] = useState(false)
  const [role, setRole] = useState('user')
  const [error, setError] = useState<string | null>(null)
  const [issued, setIssued] = useState<{ url: string; expiresAt: Date } | null>(null)

  const { execute, isPending } = useAction(createUser, {
    onSuccess: ({ data }) => {
      if (data) setIssued({ url: data.activationUrl, expiresAt: data.expiresAt })
    },
    onError: ({ error: actionError }) => {
      setError(
        resolveActionError(
          {
            'identity.errors.emailAlreadyRegistered': t('identity.errors.emailAlreadyRegistered'),
            'identity.errors.nameControlCharacters': t('identity.errors.nameControlCharacters'),
          },
          t('admin.createUser.errors.failed'),
          actionError.serverError?.messageKey,
          actionError.validationErrors,
        ),
      )
    },
  })

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const form = new FormData(event.currentTarget)
    execute({
      email: readString(form, 'email'),
      name: readString(form, 'name'),
      role: role === 'admin' ? 'admin' : 'user',
    })
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setIssued(null)
      setError(null)
      setRole('user')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="accent" />}>
        <Plus className="size-4" aria-hidden="true" />
        {t('admin.createUser.trigger')}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {issued ? t('admin.createUser.createdTitle') : t('admin.createUser.title')}
          </DialogTitle>
          <DialogDescription>
            {issued ? t('admin.createUser.createdDescription') : t('admin.createUser.description')}
          </DialogDescription>
        </DialogHeader>

        {issued ? (
          <>
            <DialogBody>
              <ActivationLinkPanel url={issued.url} expiresAt={issued.expiresAt} />
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                {t('common.done')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)}>
            <DialogBody className="flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor="name">{t('admin.createUser.name')}</FieldLabel>
                <Input id="name" name="name" required autoFocus disabled={isPending} />
              </Field>

              <Field>
                <FieldLabel htmlFor="email">{t('admin.createUser.email')}</FieldLabel>
                <Input id="email" name="email" type="email" required disabled={isPending} />
                <FieldDescription>{t('admin.createUser.emailHint')}</FieldDescription>
              </Field>

              <Field>
                <FieldLabel>{t('admin.createUser.role')}</FieldLabel>
                <Select
                  items={roleLabels}
                  value={role}
                  onValueChange={(value) => setRole(String(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">{roleLabels.user}</SelectItem>
                    <SelectItem value="admin">{roleLabels.admin}</SelectItem>
                  </SelectContent>
                </Select>
                <FieldDescription>{t('admin.createUser.roleHint')}</FieldDescription>
              </Field>

              <FormError>{error}</FormError>
            </DialogBody>

            <DialogFooter>
              <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={isPending}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" variant="accent" disabled={isPending}>
                <UserPlus className="size-4" aria-hidden="true" />
                {isPending ? t('admin.createUser.creating') : t('admin.createUser.submit')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
