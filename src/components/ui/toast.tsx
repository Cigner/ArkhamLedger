'use client'

import { Toast as ToastPrimitive } from '@base-ui/react/toast'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * Toast notifications.
 *
 * Transient confirmations only. Errors that the user must act on belong inline
 * next to the control that produced them, because a toast can be missed and
 * cannot be re-read once it has gone.
 *
 * Success toasts dismiss themselves; error toasts do not, which is why the
 * timeout is decided per toast by the caller rather than globally here.
 */
export const ToastProvider = ToastPrimitive.Provider
export const useToastManager = ToastPrimitive.useToastManager

const TONE_STYLES: Record<string, string> = {
  error: 'border-status-danger/60',
  success: 'border-status-positive/60',
  warning: 'border-status-warning/60',
}

/**
 * Renders every queued toast. Mount once, inside the application layout.
 */
export function ToastViewport({ className }: { className?: string }) {
  const { toasts } = ToastPrimitive.useToastManager()

  return (
    <ToastPrimitive.Portal>
      <ToastPrimitive.Viewport
        className={cn(
          'fixed bottom-4 right-4 z-toast flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2',
          className,
        )}
      >
        {toasts.map((toast) => (
          <ToastPrimitive.Root
            key={toast.id}
            toast={toast}
            className={cn(
              'relative rounded-lg border border-border-default bg-surface-overlay p-4 pr-10',
              'data-[starting-style]:translate-y-2 data-[starting-style]:opacity-0',
              'data-[ending-style]:opacity-0',
              'transition-all duration-[--duration-normal] ease-[--ease-out]',
              toast.type ? TONE_STYLES[toast.type] : undefined,
            )}
          >
            <ToastPrimitive.Title className="font-ui text-sm font-medium text-text-primary" />
            <ToastPrimitive.Description className="mt-1 font-ui text-xs leading-[--leading-ui] text-text-secondary" />
            <ToastPrimitive.Close
              className="absolute right-2 top-2 rounded-sm p-1.5 text-text-muted transition-interactive hover:bg-surface-hover hover:text-text-primary active:bg-surface-active"
              aria-label="Dismiss"
            >
              <X className="size-4" aria-hidden="true" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
      </ToastPrimitive.Viewport>
    </ToastPrimitive.Portal>
  )
}
