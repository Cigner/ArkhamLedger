'use client'

import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox'
import { Check, Minus } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * Checkbox.
 *
 * Square with a minimal radius to match the ledger language. The checked state
 * is a glyph rather than a fill alone, so it survives a colour-blind or
 * high-contrast rendering.
 */
export function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'inline-flex size-5 shrink-0 items-center justify-center rounded-sm',
        'border border-border-default bg-surface-subtle',
        'transition-interactive',
        'hover:border-border-strong active:bg-surface-hover',
        'data-[checked]:border-transparent data-[checked]:bg-accent-solid',
        'data-[indeterminate]:border-transparent data-[indeterminate]:bg-accent-solid',
        'disabled:cursor-not-allowed disabled:opacity-45',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-text-on-accent"
      >
        {props.indeterminate ? (
          <Minus className="size-3.5" aria-hidden="true" />
        ) : (
          <Check className="size-3.5" aria-hidden="true" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}
