import { PASSWORD_USER } from '../config/env'
import { alerta } from '../pages/AppShell'
import { expect, test } from '../fixtures/test'

/**
 * `/settings` — profile + password change.
 *
 * Runs logged out and signs in as a throwaway user: a successful change
 * rotates the credential the storage state was minted from, so it must not
 * touch an actor the rest of the suite depends on.
 */
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Configuración personal', () => {
  test.describe.configure({ mode: 'serial' })

  const NUEVA_PASSWORD = 'E2eRotada!2026'

  test.beforeEach(async ({ page, login }) => {
    await login.abrir()
    await login.ingresar(PASSWORD_USER.email, PASSWORD_USER.password)
    await page.waitForURL('**/ventas')
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
  })

  test('muestra el email de la sesión', async ({ page }) => {
    await expect(page.getByText(PASSWORD_USER.email)).toBeVisible()
  })

  test('rechaza una contraseña nueva demasiado corta', async ({ page }) => {
    const nueva = page.getByLabel('New password', { exact: true })

    await page.getByLabel('Current password').fill(PASSWORD_USER.password)
    await nueva.fill('corta')
    await page.getByLabel('Confirm new password').fill('corta')
    await page.getByRole('button', { name: /Update password|Updating/ }).click()

    // `minLength={8}` makes the browser refuse the submit, so the action's own
    // length check (defence in depth) is never reached from the UI.
    const valido = await nueva.evaluate((el: HTMLInputElement) => el.checkValidity())
    expect(valido).toBe(false)
    await expect(page).toHaveURL(/\/settings$/)
  })

  test('rechaza una confirmación que no coincide', async ({ page }) => {
    await page.getByLabel('Current password').fill(PASSWORD_USER.password)
    await page.getByLabel('New password', { exact: true }).fill('UnaPasswordLarga1')
    await page.getByLabel('Confirm new password').fill('OtraPasswordLarga1')
    await page.getByRole('button', { name: /Update password|Updating/ }).click()

    await expect(alerta(page)).toHaveText(
      'New password and confirmation do not match',
    )
  })

  test('rechaza una contraseña actual incorrecta', async ({ page }) => {
    await page.getByLabel('Current password').fill('no-es-la-actual')
    await page.getByLabel('New password', { exact: true }).fill(NUEVA_PASSWORD)
    await page.getByLabel('Confirm new password').fill(NUEVA_PASSWORD)
    await page.getByRole('button', { name: /Update password|Updating/ }).click()

    await expect(alerta(page)).toHaveText('Current password is incorrect')
  })

  test('cambia la contraseña y permite ingresar con la nueva', async ({
    page,
    login,
    shell,
  }) => {
    await page.getByLabel('Current password').fill(PASSWORD_USER.password)
    await page.getByLabel('New password', { exact: true }).fill(NUEVA_PASSWORD)
    await page.getByLabel('Confirm new password').fill(NUEVA_PASSWORD)
    await page.getByRole('button', { name: /Update password|Updating/ }).click()

    await expect(page.getByText('Password updated successfully.')).toBeVisible()

    // `/settings` lives in the auth layout, which has no sidebar — the logout
    // control only exists inside the app shell.
    await page.goto('/ventas')
    await shell.cerrarSesion()
    await login.ingresar(PASSWORD_USER.email, NUEVA_PASSWORD)
    await page.waitForURL('**/ventas')
  })
})
