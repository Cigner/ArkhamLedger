import { cn } from '@/lib/cn'

/**
 * Multi-line text input.
 *
 * Base UI has no textarea primitive because a native textarea needs no
 * behavioural wrapper; only the visual layer is shared with Input.
 */
export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex min-h-24 w-full rounded-sm border border-border-default bg-surface-subtle px-3 py-2',
        'font-ui text-sm leading-relaxed text-text-primary',
        'placeholder:text-text-muted placeholder:italic',
        'transition-colors duration-[--duration-fast]',
        'hover:border-border-strong',
        'disabled:cursor-not-allowed disabled:opacity-45',
        'aria-[invalid=true]:border-status-danger',
        className,
      )}
      {...props}
    />
  )
}
