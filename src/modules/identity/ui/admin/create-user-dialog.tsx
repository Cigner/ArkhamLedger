'use client'

import { Plus, UserPlus } from 'lucide-react'
import { useState } from 'react'
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
const ROLE_LABELS = { user: 'User', admin: 'Administrator' } as const

const MESSAGES: Record<string, string> = {
  'identity.errors.emailAlreadyRegistered': 'An account with that address already exists.',
  'identity.errors.nameControlCharacters':
    'That name contains characters that cannot be displayed.',
}

export function CreateUserDialog() {
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
          MESSAGES,
          'Could not create the account.',
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
        New user
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{issued ? 'Account created' : 'New user'}</DialogTitle>
          <DialogDescription>
            {issued
              ? 'Send this activation link to its owner. It will not be shown again.'
              : 'Creates the account and issues an activation link.'}
          </DialogDescription>
        </DialogHeader>

        {issued ? (
          <>
            <DialogBody>
              <ActivationLinkPanel url={issued.url} expiresAt={issued.expiresAt} />
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)}>
            <DialogBody className="flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <Input id="name" name="name" required autoFocus disabled={isPending} />
              </Field>

              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input id="email" name="email" type="email" required disabled={isPending} />
                <FieldDescription>Used to sign in and to reset the password.</FieldDescription>
              </Field>

              <Field>
                <FieldLabel>Role</FieldLabel>
                <Select
                  items={ROLE_LABELS}
                  value={role}
                  onValueChange={(value) => setRole(String(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Administrator</SelectItem>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Administrators manage accounts. Campaign roles are separate and set per campaign.
                </FieldDescription>
              </Field>

              <FormError>{error}</FormError>
            </DialogBody>

            <DialogFooter>
              <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" variant="accent" disabled={isPending}>
                <UserPlus className="size-4" aria-hidden="true" />
                {isPending ? 'Creating…' : 'Create account'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
