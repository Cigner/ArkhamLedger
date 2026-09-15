'use client'

import { Button, type ButtonProps } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * A control that is only an icon.
 *
 * For dense places - a table row, a card corner - where a word per action turns
 * a scannable list into a wall of text. Everywhere else a button says what it
 * does in words, because an icon alone is a guess until you have learnt it.
 *
 * The label is required and is not decoration: it becomes the accessible name
 * and the tooltip, so the control is equally usable by somebody reading the
 * screen, hovering a mouse, or listening to it. A tooltip is unreachable by
 * touch, which is why the label has to exist as a name rather than only as a
 * hint.
 */
export function IconButton({
  label,
  icon,
  side = 'top',
  ...props
}: Omit<ButtonProps, 'children' | 'size'> & {
  label: string
  icon: React.ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
}) {
  return (
    <TooltipProvider delay={400}>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button size="icon-sm" aria-label={label} {...props}>
              {icon}
            </Button>
          }
        />
        <TooltipContent side={side}>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
