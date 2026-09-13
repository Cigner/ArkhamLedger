import { Input as InputPrimitive } from '@base-ui/react/input'
import { cn } from '@/lib/cn'

/**
 * Text input.
 *
 * Reads as a ruled line on a ledger rather than a rounded pill. The invalid
 * state changes the border colour, but the field always pairs with a Field
 * component that renders the error as text too — colour alone never carries the
 * fact that something is wrong.
 */
export function Input({ className, ...props }: InputPrimitive.Props) {
  return (
    <InputPrimitive
      data-slot="input"
      className={cn(
        'flex h-10 w-full rounded-sm border border-border-default bg-surface-subtle px-3 py-2',
        'font-ui text-sm text-text-primary',
        'placeholder:text-text-muted placeholder:italic',
        'transition-colors duration-[--duration-fast]',
        'hover:border-border-strong',
        'disabled:cursor-not-allowed disabled:opacity-45',
        'data-[invalid]:border-status-danger',
        className,
      )}
      {...props}
    />
  )
}
