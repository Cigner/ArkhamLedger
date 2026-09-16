'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
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
export function DesignSystemInteractive() {
  const t = useTranslations('designSystem.interactive')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const priorityLabels = {
    required: t('priorities.required'),
    preferred: t('priorities.preferred'),
    optional: t('priorities.optional'),
  } as const

  return (
    <TooltipProvider>
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-lg tracking-[--tracking-display] text-text-primary">
          {t('title')}
        </h2>

        <div className="flex flex-wrap items-center gap-3">
          <Dialog>
            <DialogTrigger render={<Button variant="outline" />}>{t('openDialog')}</DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('dialogTitle')}</DialogTitle>
                <DialogDescription>{t('dialogDescription')}</DialogDescription>
              </DialogHeader>
              <DialogBody className="flex flex-col gap-4 font-ui text-sm text-text-secondary">
                <p>{t('dialogBody')}</p>
                {/* Stacking check: a select opened here must render above the dialog. */}
                <Select items={priorityLabels} defaultValue="required">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="required">{t('priorities.required')}</SelectItem>
                    <SelectItem value="preferred">{t('priorities.preferred')}</SelectItem>
                    <SelectItem value="optional">{t('priorities.optional')}</SelectItem>
                  </SelectContent>
                </Select>
              </DialogBody>
              <DialogFooter>
                <Button variant="ghost">{t('cancel')}</Button>
                <Button variant="accent">{t('confirmDate')}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Popover>
            <PopoverTrigger render={<Button variant="outline" />}>
              {t('openPopover')}
            </PopoverTrigger>
            <PopoverContent>
              <p className="font-ui text-sm text-text-secondary">{t('popoverBody')}</p>
            </PopoverContent>
          </Popover>

          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" />}>{t('hover')}</TooltipTrigger>
            <TooltipContent>{t('tooltip')}</TooltipContent>
          </Tooltip>

          <Button variant="danger" onClick={() => setConfirmOpen(true)}>
            {t('destructive')}
          </Button>
        </div>

        <div className="max-w-xs">
          <Select items={priorityLabels} defaultValue="required">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="required">{t('priorities.required')}</SelectItem>
              <SelectItem value="preferred">{t('priorities.preferred')}</SelectItem>
              <SelectItem value="optional">{t('priorities.optional')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Tabs defaultValue="heatmap">
          <TabsList>
            <TabsTrigger value="heatmap">{t('tabs.heatmap')}</TabsTrigger>
            <TabsTrigger value="people">{t('tabs.people')}</TabsTrigger>
            <TabsTrigger value="responses">{t('tabs.responses')}</TabsTrigger>
          </TabsList>
          <TabsContent value="heatmap" className="pt-4 font-ui text-sm text-text-secondary">
            {t('tabs.heatmapBody')}
          </TabsContent>
          <TabsContent value="people" className="pt-4 font-ui text-sm text-text-secondary">
            {t('tabs.peopleBody')}
          </TabsContent>
          <TabsContent value="responses" className="pt-4 font-ui text-sm text-text-secondary">
            {t('tabs.responsesBody')}
          </TabsContent>
        </Tabs>

        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={t('confirm.title')}
          description={t('confirm.description')}
          confirmLabel={t('confirm.action')}
          destructive
          onConfirm={() => setConfirmOpen(false)}
        />
      </section>
    </TooltipProvider>
  )
}
