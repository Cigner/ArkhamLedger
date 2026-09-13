'use client'

import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip'
import { cn } from '@/lib/cn'

/**
 * Tooltip.
 *
 * Supplementary information only. Anything a user must read to operate a control
 * belongs in a visible label or description, since tooltips are unreachable by
 * touch and easy to miss.
 */
export const TooltipProvider = TooltipPrimitive.Provider
export const Tooltip = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger

export function TooltipContent({
  className,
  sideOffset = 6,
  side = 'top',
  ...props
}: TooltipPrimitive.Popup.Props & Pick<TooltipPrimitive.Positioner.Props, 'sideOffset' | 'side'>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner className="z-tooltip" sideOffset={sideOffset} side={side}>
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            'max-w-64 rounded-sm border border-border-default bg-surface-overlay px-2.5 py-1.5',
            'font-ui text-xs leading-[--leading-ui] text-text-primary',
            'data-[open]:animate-in data-[open]:fade-in-0',
            'data-[closed]:animate-out data-[closed]:fade-out-0',
            className,
          )}
          {...props}
        />
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}
