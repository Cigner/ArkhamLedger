'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'

/**
 * Displays a one-time activation link.
 *
 * The link is selectable text as well as a copy button, because clipboard access
 * fails silently in some browsers and over plain HTTP - which is exactly the
 * setup a self-hosted deployment behind a self-signed certificate may have.
 */
export function ActivationLinkPanel({ url, expiresAt }: { url: string; expiresAt: Date }) {
  const t = useTranslations('admin.activationLink')
  const format = useFormatter()
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-sm border border-border-default bg-surface-subtle p-3">
        <code className="block break-all font-mono text-xs leading-relaxed text-text-primary">
          {url}
        </code>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="font-ui text-xs text-text-muted">
          {t('expires')}{' '}
          <time dateTime={expiresAt.toISOString()}>
            {format.dateTime(expiresAt, { day: 'numeric', month: 'long' })}
          </time>
        </p>
        <Button variant="outline" size="sm" onClick={() => void handleCopy()}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? t('copied') : t('copy')}
        </Button>
      </div>
    </div>
  )
}
