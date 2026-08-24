import { expect, test, unique } from '../fixtures/test'

test.describe('Precios · reglas', () => {
  test('crea un descuento global y lo lista', async ({ page, reglas, shell }) => {
    const nombre = unique('Descuento E2E')

    await reglas.abrirNueva()
    await reglas.nombre.fill(nombre)
    await reglas.tipoRegla.selectOption({ label: 'Descuento' })
    await reglas.tipoValor.selectOption({ label: 'Porcentaje' })
    await reglas.porcentaje.fill('10')
    await reglas.guardar.click()

    await shell.expectSuccessToast('Regla creada')
    await page.waitForURL(/\/precios\/reglas$/)
    await expect(reglas.fila(nombre)).toBeVisible()
  })

  test('crea un descuento acotado a una categoría', async ({ page, reglas, shell, seed }) => {
    const nombre = unique('Descuento categoría')

    await reglas.abrirNueva()
    await reglas.nombre.fill(nombre)
    await reglas.tipoRegla.selectOption({ label: 'Descuento' })
    await reglas.alcance.selectOption({ label: 'Categoría' })
    await reglas.categoria.selectOption({ label: seed.categoriaConTalles.nombre })
    await reglas.porcentaje.fill('5')
    await reglas.guardar.click()

    await shell.expectSuccessToast('Regla creada')
    await page.waitForURL(/\/precios\/reglas$/)
    await expect(reglas.fila(nombre)).toBeVisible()
  })

  test('rechaza un valor de cero', async ({ page, reglas }) => {
    await reglas.abrirNueva()
    await reglas.nombre.fill(unique('Regla inválida'))
    await reglas.porcentaje.fill('0')
    await reglas.guardar.click()

    await expect(reglas.error).toHaveText('El valor tiene que ser mayor a 0')
    await expect(page).toHaveURL(/\/precios\/reglas\/nueva$/)
  })

  test('rechaza un porcentaje por encima del máximo permitido', async ({ page, reglas }) => {
    await reglas.abrirNueva()
    await reglas.nombre.fill(unique('Regla absurda'))
    await reglas.porcentaje.fill('900')
    await reglas.guardar.click()

    // The input declares `max={500}`, so native constraint validation blocks
    // the submit before the action ever runs — nothing is persisted and the
    // form stays put.
    const valido = await reglas.porcentaje.evaluate((el: HTMLInputElement) => el.checkValidity())
    expect(valido).toBe(false)
    await expect(page).toHaveURL(/\/precios\/reglas\/nueva$/)
  })

  // Desde 00063 el recargo por cuotas no es una regla de precio: vive en
  // `recargo_cuotas`, en Precios y Cuentas, donde se lo puede enfrentar con el
  // arancel que pretende cubrir. Que el tipo ya no se ofrezca ES el contrato:
  // si reaparece, vuelven a existir dos lugares para definir un recargo.
  test('el tipo Recargo ya no se ofrece como regla de precio', async ({ reglas }) => {
    await reglas.abrirNueva()

    const tipos = await reglas.tipoRegla
      .locator('option')
      .allTextContents()

    expect(tipos).toEqual(['Margen', 'Descuento'])
  })

  test('rechaza un alcance por categoría sin categoría elegida', async ({ reglas }) => {
    await reglas.abrirNueva()
    await reglas.nombre.fill(unique('Regla sin ref'))
    await reglas.alcance.selectOption({ label: 'Categoría' })
    await reglas.porcentaje.fill('10')
    await reglas.guardar.click()

    await expect(reglas.error).toHaveText('Elegí una categoría')
  })
})

test.describe('Precios · control', () => {
  test('recalcula el precio de venta de un producto nuevo', async ({
    nuevoProducto,
    controlPrecios,
    seed,
    page,
  }) => {
    const nombre = unique('Producto a tasar')

    await nuevoProducto.crear({ nombre, categoria: seed.categoriaSimple.nombre, costo: '10000' })
    await page.waitForURL(/\/inventario(\?|$)/)

    await controlPrecios.recalcular(nombre)

    // Recalculating drops the row out of the "sin precio" filter it was found
    // under, so the assertion has to look at the unfiltered list.
    await controlPrecios.estado.selectOption({ label: 'Todos' })

    const fila = controlPrecios.fila(nombre)
    // 10.000 cost + the seeded 60% margin rule → 16.000 list price.
    await expect(fila.getByText('$ 16.000').first()).toBeVisible()
    // The badge carries a screen-reader prefix ("Success: OK"), so the
    // assertion is a containment check on the row.
    await expect(fila).toContainText('OK')
  })
})
