'use client'

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from './button'

/**
 * Modal dialog.
 *
 * Base UI handles the focus trap, scroll lock, escape handling and aria wiring;
 * everything here is presentation. The backdrop uses a heavy ink alpha plus a
 * slight blur so the page reads as receding rather than dimmed.
 *
 * Enter and exit animations key off the primitive's data-open / data-closed
 * attributes and are neutralised under prefers-reduced-motion globally.
 */
export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export function DialogBackdrop({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-backdrop"
      className={cn(
        'fixed inset-0 z-50 bg-scrim supports-[backdrop-filter]:backdrop-blur-[2px]',
        'data-[open]:animate-in data-[open]:fade-in-0',
        'data-[closed]:animate-out data-[closed]:fade-out-0',
        className,
      )}
      {...props}
    />
  )
}

export function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & { showCloseButton?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogBackdrop />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2',
          'rounded-lg border border-border-default bg-surface-overlay',
          'max-h-[calc(100dvh-2rem)] overflow-y-auto',
          'data-[open]:animate-in data-[open]:fade-in-0 data-[open]:zoom-in-[0.98]',
          'data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-[0.98]',
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close
            render={<Button variant="ghost" size="icon-sm" className="absolute right-3 top-3" />}
          >
            <X aria-hidden="true" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  )
}

export function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col gap-1.5 border-b border-border-subtle px-6 py-4 pr-12', className)}
      {...props}
    />
  )
}

export function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        'font-display text-xl leading-[--leading-tight] tracking-[--tracking-display] text-text-primary',
        className,
      )}
      {...props}
    />
  )
}

export function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('font-ui text-sm leading-[--leading-ui] text-text-secondary', className)}
      {...props}
    />
  )
}

export function DialogBody({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="dialog-body" className={cn('px-6 py-5', className)} {...props} />
}

export function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'flex flex-col-reverse gap-2 border-t border-border-subtle px-6 py-4 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  )
}
