import { contenido } from '../pages/AppShell'
import { expect, test, unique } from '../fixtures/test'

/**
 * The sale flow, end to end: a product only becomes sellable after it has
 * stock AND a resolved list price, so the specs walk that chain instead of
 * assuming a pre-priced fixture. The intermediate state (stock but no price)
 * is a real error the cart has to surface, so it is asserted on the way.
 */
test.describe('Ventas · carrito', () => {
  test('un código inexistente no agrega nada al carrito', async ({ nuevaVenta }) => {
    await nuevaVenta.abrir()
    await nuevaVenta.agregarPorTexto('QR-QUE-NO-EXISTE-E2E')

    await expect(nuevaVenta.errorBusqueda).toHaveText(
      'No se encontró un ítem con ese QR en este tenant.',
    )
    await expect(nuevaVenta.lineas).toHaveCount(0)
  })

  test('no se puede avanzar al cobro con el carrito vacío', async ({ nuevaVenta, page }) => {
    await nuevaVenta.abrir()

    await expect(nuevaVenta.continuarAlCobro).toBeDisabled()
    await expect(page.getByText('Escaneá el primer ítem para empezar la venta.')).toBeVisible()
  })

  test('un producto sin precio de venta no se puede cargar', async ({
    nuevoProducto,
    nuevaVenta,
    seed,
    page,
  }) => {
    const nombre = unique('Sin precio E2E')

    await nuevoProducto.crear({
      nombre,
      categoria: seed.categoriaSimple.nombre,
      costo: '8000',
      stock: 1,
    })
    await page.waitForURL(/\/inventario(\?|$)/)

    await nuevaVenta.abrir()
    await nuevaVenta.agregarPorSugerencia(nombre)

    await expect(nuevaVenta.errorBusqueda).toHaveText(
      'El producto no tiene precio de venta. Fijalo en Precios → Control de precios.',
    )
    await expect(nuevaVenta.lineas).toHaveCount(0)
  })

  test('registra una venta completa y la refleja en el listado del período', async ({
    nuevoProducto,
    controlPrecios,
    nuevaVenta,
    ventas,
    shell,
    seed,
    page,
  }) => {
    const nombre = unique('Vendible E2E')

    // 1. Product with stock and a cost.
    await nuevoProducto.crear({
      nombre,
      categoria: seed.categoriaSimple.nombre,
      costo: '10000',
      stock: 2,
    })
    await page.waitForURL(/\/inventario(\?|$)/)

    // 2. Resolve its list price (10.000 + 60% margin = 16.000).
    await controlPrecios.recalcular(nombre)

    // 3. Sell one unit.
    await nuevaVenta.abrir()
    await nuevaVenta.agregarPorSugerencia(nombre)

    await expect(nuevaVenta.lineas).toHaveCount(1)
    await expect(nuevaVenta.lineas.first()).toContainText(nombre)
    await expect(nuevaVenta.total).toHaveText('$ 16.000')

    await nuevaVenta.cobrarYConfirmar()

    await shell.expectSuccessToast('Venta registrada')
    await page.waitForURL(/\/ventas\/[0-9a-f-]{36}$/)
    await expect(page.getByText(nombre).first()).toBeVisible()

    // 4. It shows up in the period listing.
    await ventas.abrir()
    await expect(ventas.fila('$ 16.000').first()).toBeVisible()
  })

  test('quitar la única línea vuelve a bloquear el cobro', async ({
    nuevoProducto,
    controlPrecios,
    nuevaVenta,
    seed,
    page,
  }) => {
    const nombre = unique('Quitable E2E')

    await nuevoProducto.crear({
      nombre,
      categoria: seed.categoriaSimple.nombre,
      costo: '5000',
      stock: 1,
    })
    await page.waitForURL(/\/inventario(\?|$)/)
    await controlPrecios.recalcular(nombre)

    await nuevaVenta.abrir()
    await nuevaVenta.agregarPorSugerencia(nombre)
    await expect(nuevaVenta.lineas).toHaveCount(1)

    await nuevaVenta.lineas.first().getByRole('button', { name: 'Quitar' }).click()

    await expect(nuevaVenta.lineas).toHaveCount(0)
    await expect(nuevaVenta.continuarAlCobro).toBeDisabled()
  })
})

test.describe('Precios · cuentas de cobro', () => {
  test('crea una cuenta de cobro y rechaza un nombre corto', async ({ page, shell }) => {
    await page.goto('/precios/cuentas')
    await expect(shell.titulo).toHaveText('Cuentas y recargos')

    await page.getByRole('button', { name: 'Nueva cuenta' }).click()

    // Error case first: the create button stays disabled under 2 characters.
    await contenido(page).getByLabel(/^Nombre/).fill('A')
    await expect(page.getByRole('button', { name: /Crear cuenta|Creando/ })).toBeDisabled()

    const nombre = unique('Cuenta E2E')
    await contenido(page).getByLabel(/^Nombre/).fill(nombre)
    await contenido(page).getByLabel(/^Tipo/).selectOption({ label: 'Cuenta bancaria' })
    await page.getByRole('button', { name: /Crear cuenta|Creando/ }).click()

    await shell.expectSuccessToast('Cuenta creada')
    await expect(page.getByRole('row').filter({ hasText: nombre })).toBeVisible()
  })
})
