import fs from 'node:fs'
import path from 'node:path'
import { expect, test as setup, type Browser } from '@playwright/test'
import { ADMIN, BASE_URL, VENDEDOR, type E2EUser } from '../config/env'
import { provisionTenant } from '../support/tenant'

/**
 * The `setup` project: rebuilds the E2E tenant and mints one storage state per
 * actor. Every other project depends on this, so specs open already
 * authenticated instead of paying a login round-trip each.
 *
 * Both steps live in ONE test because their order matters — the storage
 * states are useless until the users behind them exist.
 */
setup('provision tenant and authenticate actors', async ({ browser }) => {
  setup.setTimeout(180_000)

  await provisionTenant()

  await signInAndSaveState(browser, ADMIN)
  await signInAndSaveState(browser, VENDEDOR)
})

async function signInAndSaveState(browser: Browser, user: E2EUser): Promise<void> {
  const context = await browser.newContext({ baseURL: BASE_URL })
  const page = await context.newPage()

  try {
    await page.goto('/login')
    await page.getByLabel('Correo electrónico').fill(user.email)
    await page.getByLabel('Contraseña').fill(user.password)
    await page.getByRole('button', { name: 'Ingresar' }).click()

    // `loginAction` redirects to /ventas — the sidebar's logout control only
    // renders inside the authenticated shell, so it is the real "logged in"
    // signal, not just the URL.
    await page.waitForURL('**/ventas')
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible()

    fs.mkdirSync(path.dirname(user.storageState), { recursive: true })
    await context.storageState({ path: user.storageState })
  } finally {
    await context.close()
  }
}
