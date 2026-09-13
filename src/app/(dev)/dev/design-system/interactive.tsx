'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ConfirmDialog } from '@/components/patterns/confirm-dialog'

/**
 * Interactive half of the design system gallery.
 *
 * Split from the page so the catalogue itself stays a server component and only
 * the overlays that genuinely need state ship to the browser.
 */
const PRIORITY_LABELS = {
  required: 'Required',
  preferred: 'Preferred',
  optional: 'Optional',
} as const

export function DesignSystemInteractive() {
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <TooltipProvider>
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-lg tracking-[--tracking-display] text-text-primary">
          Overlays
        </h2>

        <div className="flex flex-wrap items-center gap-3">
          <Dialog>
            <DialogTrigger render={<Button variant="outline" />}>Open dialog</DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Schedule session</DialogTitle>
                <DialogDescription>
                  Availability closes on Thursday at midnight.
                </DialogDescription>
              </DialogHeader>
              <DialogBody className="flex flex-col gap-4 font-ui text-sm text-text-secondary">
                <p>Focus is trapped, the page behind is locked, and Escape dismisses.</p>
                {/* Stacking check: a select opened here must render above the dialog. */}
                <Select items={PRIORITY_LABELS} defaultValue="required">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="required">Required</SelectItem>
                    <SelectItem value="preferred">Preferred</SelectItem>
                    <SelectItem value="optional">Optional</SelectItem>
                  </SelectContent>
                </Select>
              </DialogBody>
              <DialogFooter>
                <Button variant="ghost">Cancel</Button>
                <Button variant="accent">Confirm date</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Popover>
            <PopoverTrigger render={<Button variant="outline" />}>Open popover</PopoverTrigger>
            <PopoverContent>
              <p className="font-ui text-sm text-text-secondary">
                Positioned and dismissed by the primitive.
              </p>
            </PopoverContent>
          </Popover>

          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" />}>Hover me</TooltipTrigger>
            <TooltipContent>Supplementary only — never load-bearing.</TooltipContent>
          </Tooltip>

          <Button variant="danger" onClick={() => setConfirmOpen(true)}>
            Destructive action
          </Button>
        </div>

        <div className="max-w-xs">
          <Select items={PRIORITY_LABELS} defaultValue="required">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="required">Required</SelectItem>
              <SelectItem value="preferred">Preferred</SelectItem>
              <SelectItem value="optional">Optional</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Tabs defaultValue="heatmap">
          <TabsList>
            <TabsTrigger value="heatmap">Heatmap</TabsTrigger>
            <TabsTrigger value="people">By person</TabsTrigger>
            <TabsTrigger value="responses">Responses</TabsTrigger>
          </TabsList>
          <TabsContent value="heatmap" className="pt-4 font-ui text-sm text-text-secondary">
            The Keeper&rsquo;s aggregate view.
          </TabsContent>
          <TabsContent value="people" className="pt-4 font-ui text-sm text-text-secondary">
            Named availability — Keeper only.
          </TabsContent>
          <TabsContent value="responses" className="pt-4 font-ui text-sm text-text-secondary">
            Who has answered and who has not.
          </TabsContent>
        </Tabs>

        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Cancel this session?"
          description="Every participant will be notified. This cannot be undone."
          confirmLabel="Cancel session"
          destructive
          onConfirm={() => setConfirmOpen(false)}
        />
      </section>
    </TooltipProvider>
  )
}
