import { Separator as SeparatorPrimitive } from '@base-ui/react/separator'
import { cn } from '@/lib/cn'

/**
 * Separator.
 *
 * Purely decorative, which is why it uses the subtle border token — the one
 * token intentionally exempt from the 3:1 non-text contrast rule, since it never
 * identifies a control or a state.
 */
export function Separator({
  className,
  orientation = 'horizontal',
  ...props
}: SeparatorPrimitive.Props) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        'shrink-0 bg-border-subtle',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...props}
    />
  )
}
