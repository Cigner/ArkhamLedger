import { cn } from '@/lib/cn'

/**
 * How many people have answered.
 *
 * Shown to everyone, because it is an aggregate and reveals nothing about who
 * said what - the distinction the whole privacy rule rests on. The bar is
 * accompanied by the numbers rather than replacing them.
 */
export function ResponseProgress({
  responded,
  total,
  className,
}: {
  responded: number
  total: number
  className?: string
}) {
  const percentage = total === 0 ? 0 : Math.round((responded / total) * 100)

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        role="progressbar"
        aria-valuenow={responded}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={`${responded} of ${total} participants have answered`}
        className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-hover"
      >
        <div
          className="h-full rounded-full bg-candle-9 transition-interactive"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span data-tabular className="font-ui text-xs text-text-secondary">
        {responded} of {total} answered
      </span>
    </div>
  )
}
