'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * Confirmation dialog for irreversible actions.
 *
 * The confirm label is a verb naming what will happen ("Delete campaign"), not
 * a bare "OK": a user who skims the body still reads the button, and that is
 * where the last chance to understand the consequence lies.
 *
 * Children are for a choice the confirmation itself depends on — how far a
 * deletion goes, say. Anything that is merely information belongs in the
 * description.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  pending = false,
  onConfirm,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  confirmLabel: string
  cancelLabel?: string
  destructive?: boolean
  pending?: boolean
  onConfirm: () => void
  /** An extra choice the confirmation depends on, rendered below the description. */
  children?: React.ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" showCloseButton={false}>
        <DialogHeader className="pr-6">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {description || children ? (
          <DialogBody className="flex flex-col gap-4">
            {description ? <DialogDescription>{description}</DialogDescription> : null}
            {children}
          </DialogBody>
        ) : null}
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" disabled={pending} />}>
            {cancelLabel}
          </DialogClose>
          <Button
            variant={destructive ? 'danger' : 'accent'}
            onClick={onConfirm}
            disabled={pending}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
