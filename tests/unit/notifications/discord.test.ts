import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DispatchContext } from '@/modules/notifications/domain/dispatcher'
import { discordWebhookSchema } from '@/modules/notifications/domain/schemas'

vi.mock('@/lib/logger', () => ({ appLogger: { warn: vi.fn() } }))

const { discordDispatcher } = await import('@/modules/notifications/dispatchers/discord')

const WEBHOOK = 'https://discord.com/api/webhooks/123456789/secret_token-value'
const NOW = new Date('2026-09-16T18:00:00.000Z')

function context(overrides: Partial<DispatchContext> = {}): DispatchContext {
  return {
    notification: {
      id: '01H00000000000000000000001',
      userId: '01H00000000000000000000002',
      type: 'SESSION_SCHEDULED',
      campaignId: '01H00000000000000000000003',
      gameSessionId: '01H00000000000000000000004',
      payload: {},
      readAt: null,
      createdAt: NOW,
    },
    recipient: {
      userId: '01H00000000000000000000002',
      name: 'Anna',
      email: 'anna@example.test',
      timezone: 'Europe/Warsaw',
    },
    message: {
      subject: 'Confirmed',
      body: 'Confirmed',
      channelText: 'The session is confirmed. @everyone',
      href: '/sessions/example',
    },
    campaign: {
      campaignId: '01H00000000000000000000003',
      name: 'Masks',
      discordWebhookUrl: WEBHOOK,
    },
    ...overrides,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Discord webhook validation', () => {
  it.each([WEBHOOK, 'https://discordapp.com/api/webhooks/123456789/abc-DEF_123'])(
    'accepts a Discord-issued webhook: %s',
    (url) => {
      expect(
        discordWebhookSchema.safeParse({ campaignId: '01H00000000000000000000001', url }).success,
      ).toBe(true)
    },
  )

  it.each([
    'http://discord.com/api/webhooks/1/token',
    'https://discord.com.attacker.test/api/webhooks/1/token',
    'https://localhost/api/webhooks/1/token',
    'https://discord.com/api/webhooks/1/token?redirect=https://attacker.test',
  ])('rejects a webhook that could be used for SSRF: %s', (url) => {
    expect(
      discordWebhookSchema.safeParse({ campaignId: '01H00000000000000000000001', url }).success,
    ).toBe(false)
  })
})

describe('Discord dispatcher', () => {
  it('posts one mention-safe JSON message to the configured webhook', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(discordDispatcher.send(context())).resolves.toEqual({ kind: 'SENT' })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(WEBHOOK)
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'content-type': 'application/json' })
    expect(typeof init.body).toBe('string')
    expect(JSON.parse(init.body as string)).toEqual({
      content: '**Masks** - The session is confirmed. @everyone',
      allowed_mentions: { parse: [] },
    })
  })

  it('declines and does not call the network when no webhook exists', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const withoutWebhook = context({
      campaign: {
        campaignId: '01H00000000000000000000003',
        name: 'Masks',
        discordWebhookUrl: null,
      },
    })

    expect(discordDispatcher.supports(withoutWebhook)).toBe(false)
    await expect(discordDispatcher.send(withoutWebhook)).resolves.toEqual({
      kind: 'PERMANENT',
      error: 'no webhook configured',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    [400, 'PERMANENT'],
    [401, 'PERMANENT'],
    [404, 'PERMANENT'],
    [408, 'RETRYABLE'],
    [429, 'RETRYABLE'],
    [500, 'RETRYABLE'],
  ] as const)('classifies Discord status %s as %s', async (status, kind) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })))

    await expect(discordDispatcher.send(context())).resolves.toEqual({
      kind,
      error: `discord ${status}`,
    })
  })

  it('turns a transport exception into a retryable result instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network unavailable')))

    await expect(discordDispatcher.send(context())).resolves.toEqual({
      kind: 'RETRYABLE',
      error: 'TypeError: network unavailable',
    })
  })

  it('limits content to 2,000 Unicode code points without splitting an emoji', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await discordDispatcher.send(
      context({
        message: {
          subject: 'Long',
          body: 'Long',
          channelText: '🦑'.repeat(2_100),
          href: null,
        },
      }),
    )

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(typeof init.body).toBe('string')
    const payload = JSON.parse(init.body as string) as { content: string }
    expect([...payload.content]).toHaveLength(2_000)
    expect(payload.content).not.toContain('�')
  })
})
