import { expect, test, type Page } from '@playwright/test'

const PASSWORD = 'arkham-dev-password'
const FAKE_WEBHOOK = 'https://discord.com/api/webhooks/123456789012345678/test_token_for_local_e2e'

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/campaigns')
}

async function openMasksSettings(page: Page): Promise<void> {
  await page
    .getByRole('link', { name: /Masks of Nyarlathotep/ })
    .first()
    .click()
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
}

test.describe.serial('Discord campaign integration', () => {
  test('the owner can securely configure and remove a webhook', async ({ page }) => {
    await signIn(page, 'eleanor@arkham.test')
    await openMasksSettings(page)

    const discord = page
      .getByRole('heading', { name: 'Discord', exact: true })
      .locator('..')
      .locator('..')
    await expect(discord).toContainText('Paste a channel webhook')

    await discord.getByLabel('Webhook address').fill(FAKE_WEBHOOK)
    await discord.getByRole('button', { name: 'Save webhook' }).click()
    await expect(discord).toContainText('One is already stored')

    await discord.getByRole('button', { name: 'Remove' }).click()
    const confirmation = page.getByRole('dialog', { name: 'Stop posting to Discord?' })
    await confirmation.getByRole('button', { name: 'Remove webhook' }).click()
    await expect(discord).toContainText('Paste a channel webhook')
  })

  test('a co-Keeper can open settings but cannot see integration controls', async ({ page }) => {
    await signIn(page, 'harriet@arkham.test')
    await openMasksSettings(page)

    await expect(page.getByRole('heading', { name: 'Discord', exact: true })).toHaveCount(0)
    await expect(page.getByLabel('Webhook address')).toHaveCount(0)
  })
})
