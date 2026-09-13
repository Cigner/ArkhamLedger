'use client'

import { Popover as PopoverPrimitive } from '@base-ui/react/popover'
import { cn } from '@/lib/cn'

/**
 * Popover.
 *
 * Positioning, collision handling and dismissal come from the primitive. The
 * popup sits on the overlay surface so it separates from cards beneath it
 * without a shadow.
 */
export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger

export function PopoverContent({
  className,
  sideOffset = 6,
  align = 'center',
  side = 'bottom',
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<PopoverPrimitive.Positioner.Props, 'sideOffset' | 'align' | 'side'>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        className="z-popover"
        sideOffset={sideOffset}
        align={align}
        side={side}
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            'min-w-48 rounded-lg border border-border-default bg-surface-overlay p-4',
            'font-ui text-sm text-text-primary',
            'data-[open]:animate-in data-[open]:fade-in-0 data-[open]:zoom-in-[0.98]',
            'data-[closed]:animate-out data-[closed]:fade-out-0',
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}
