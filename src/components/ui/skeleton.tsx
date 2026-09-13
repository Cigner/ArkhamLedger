import { cn } from '@/lib/cn'

/**
 * Loading placeholder.
 *
 * Mirrors the shape of the content it stands in for rather than spinning, so the
 * layout does not jump when data arrives. The pulse is disabled under
 * prefers-reduced-motion by the global stylesheet.
 */
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('animate-pulse rounded-sm bg-surface-hover', className)}
      {...props}
    />
  )
}
