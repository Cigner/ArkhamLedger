import { cn } from '@/lib/cn'

/**
 * Form-level error banner.
 *
 * Paired with a glyph and placed above the submit button, where a user who has
 * just pressed submit is already looking. Colour never carries the meaning on
 * its own.
 */
export function FormError({ children, className }: { children: React.ReactNode; className?: string }) {
  if (!children) return null

  return (
    <p
      role="alert"
      className={cn(
        'flex items-start gap-2 rounded-sm border border-status-danger/50 bg-sanguine-3 px-3 py-2',
        'font-ui text-xs leading-[--leading-ui] text-sanguine-12',
        className,
      )}
    >
      <span aria-hidden="true">✕</span>
      <span>{children}</span>
    </p>
  )
}
