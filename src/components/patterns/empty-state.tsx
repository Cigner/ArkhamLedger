import { cn } from '@/lib/cn'

/**
 * Empty state.
 *
 * Always paired with an action: an empty screen that only says "nothing here"
 * leaves the user to work out what to do next. The copy carries the setting's
 * voice, but the action is plain and unambiguous.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  icon?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-default px-6 py-14 text-center',
        className,
      )}
    >
      {icon ? (
        <div className="text-text-muted" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <p className="font-ornament text-2xl leading-[--leading-tight] text-text-secondary">
        {title}
      </p>
      {description ? (
        <p className="max-w-sm font-ui text-sm leading-[--leading-ui] text-text-muted">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
