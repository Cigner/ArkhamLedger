'use client'

import { Select as SelectPrimitive } from '@base-ui/react/select'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * Select.
 *
 * Base UI renders a listbox rather than a native select, which is what makes it
 * stylable; keyboard behaviour, typeahead and aria wiring come from the
 * primitive. The trigger matches Input so a form reads as one system.
 *
 * Pass `items` to the root as a value-to-label record. Without it the trigger
 * displays the raw value — "user" rather than "User" — because the primitive has
 * no other way to know what an item's text was.
 */
export const Select = SelectPrimitive.Root
export const SelectValue = SelectPrimitive.Value
export const SelectGroup = SelectPrimitive.Group

export function SelectTrigger({ className, children, ...props }: SelectPrimitive.Trigger.Props) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        'flex cursor-pointer h-10 w-full items-center justify-between gap-2 rounded-sm px-3 py-2',
        'border border-border-default bg-surface-subtle',
        'font-ui text-sm text-text-primary',
        'transition-interactive',
        'hover:border-border-strong active:bg-surface-hover',
        'disabled:cursor-not-allowed disabled:opacity-45',
        'data-[invalid]:border-status-danger',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon className="text-text-muted">
        <ChevronDown className="size-4" aria-hidden="true" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

export function SelectContent({ className, children, ...props }: SelectPrimitive.Popup.Props) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner className="z-popover" sideOffset={4} alignItemWithTrigger={false}>
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            'max-h-72 min-w-[var(--anchor-width)] overflow-y-auto rounded-sm p-1',
            'border border-border-default bg-surface-overlay',
            'data-[open]:animate-in data-[open]:fade-in-0',
            'data-[closed]:animate-out data-[closed]:fade-out-0',
            className,
          )}
          {...props}
        >
          {children}
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

export function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        'relative flex cursor-default select-none items-center gap-2 rounded-sm py-2 pl-8 pr-3',
        'font-ui text-sm text-text-primary outline-none',
        'data-[highlighted]:bg-surface-hover',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-45',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemIndicator className="absolute left-2 flex items-center text-candle-11">
        <Check className="size-4" aria-hidden="true" />
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

export function SelectGroupLabel({ className, ...props }: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-group-label"
      className={cn(
        'px-3 py-1.5 font-ui text-2xs uppercase tracking-[--tracking-smallcaps] text-text-muted',
        className,
      )}
      {...props}
    />
  )
}
