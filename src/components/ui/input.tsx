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
        'transition-interactive',
        'hover:border-border-strong',
        'disabled:cursor-not-allowed disabled:opacity-45',
        // readOnly keeps the value in the form payload; disabled would drop it.
        'read-only:cursor-default read-only:border-border-subtle read-only:text-text-secondary',
        'data-[invalid]:border-status-danger',
        className,
      )}
      {...props}
    />
  )
}
