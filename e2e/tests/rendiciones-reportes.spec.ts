import { contenido, fillEstable } from '../pages/AppShell'
import { expect, test } from '../fixtures/test'
import { isoDate } from '../support/data'

test.describe('Rendiciones', () => {
  test('el listado muestra el estado vacío del tenant nuevo', async ({ page, shell }) => {
    await page.goto('/rendiciones')

    await expect(shell.titulo).toHaveText('Rendiciones')
    await expect(page.getByText('Sin rendiciones generadas')).toBeVisible()
  })

  test('el alta pide un proveedor antes de mostrar nada', async ({ page, shell }) => {
    await page.goto('/rendiciones/nueva')

    await expect(shell.titulo).toHaveText('Generar rendición')
    await expect(
      page.getByText('Elegí un proveedor para ver las ventas pendientes de rendirle.'),
    ).toBeVisible()
  })

  test('un proveedor sin ventas de consignación no tiene líneas pendientes', async ({
    page,
    seed,
  }) => {
    await page.goto('/rendiciones/nueva')

    await contenido(page).getByLabel(/^Proveedor/)
      .selectOption({ label: `${seed.proveedorConsignatario.nombre} · consignatario` })

    await expect(page).toHaveURL(new RegExp(`prov=${seed.proveedorConsignatario.id}`))
    await expect(page.getByText('No hay líneas pendientes')).toBeVisible()
  })
})

test.describe('Reportes', () => {
  test('la vista consolidada carga con el período por defecto', async ({ page, shell }) => {
    await page.goto('/reportes')

    await expect(shell.titulo).toHaveText('Tablero financiero')
    await expect(page.getByText('Vendiste')).toBeVisible()

    // El gráfico de tendencia debe terminar en el mes actual
    const mesActual = Intl.DateTimeFormat('es-AR', { month: 'short', year: '2-digit' }).format(new Date())
    await expect(page.locator('svg text.text-muted.font-medium').last()).toHaveText(mesActual)
  })

  test('cambiar el período se refleja en la URL', async ({ page }) => {
    await page.goto('/reportes')

    const desde = isoDate(-30)
    const hasta = isoDate(0)

    await fillEstable(contenido(page).getByLabel(/^Desde/), desde)
    await fillEstable(contenido(page).getByLabel(/^Hasta/), hasta)
    await page.getByRole('button', { name: 'Aplicar' }).click()

    await expect(page).toHaveURL(new RegExp(`desde=${desde}`))
    await expect(page).toHaveURL(new RegExp(`hasta=${hasta}`))
  })
})
