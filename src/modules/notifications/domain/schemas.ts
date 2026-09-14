import { z } from 'zod'

/**
 * Input schemas for notification settings.
 */
const idSchema = z.string().length(26)

export const markReadSchema = z.object({
  ids: z.array(idSchema).min(1).max(200),
})

export const channelPreferenceSchema = z.object({
  /** In-app is absent on purpose: it is the record, not a delivery choice. */
  channel: z.enum(['EMAIL']),
  enabled: z.boolean(),
})

/**
 * A Discord webhook URL.
 *
 * Checked against the two hosts Discord actually issues, because this value is
 * posted to by a background job: accepting an arbitrary URL would turn the
 * settings form into a request forwarder aimed at whatever an administrator
 * could be persuaded to paste.
 */
const DISCORD_WEBHOOK_PATTERN =
  /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/

export const discordWebhookSchema = z.object({
  campaignId: idSchema,
  url: z
    .string()
    .trim()
    .max(500)
    .regex(DISCORD_WEBHOOK_PATTERN, { error: 'notifications.errors.notADiscordWebhook' }),
})

export const campaignIdSchema = z.object({ campaignId: idSchema })

export function isDiscordWebhookUrl(url: string): boolean {
  return DISCORD_WEBHOOK_PATTERN.test(url)
}
