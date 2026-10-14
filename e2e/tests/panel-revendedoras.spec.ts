import { expect, test, unique } from '../fixtures/test'

test.describe('Panel de gestión de revendedoras (Slice 4b)', () => {
  test('panel principal: tarjetas KPI, tabla, filtros y exportación CSV', async ({
    page,
  }) => {
    // 1. Dar de alta una revendedora
    await page.goto('/revendedoras/nuevo')
    const nombreRev = unique('Silvia')
    const apellidoRev = 'Panel'
    const emailRev = `${nombreRev.toLowerCase().replace(/\s+/g, '')}@test.com`

    await page.getByLabel(/^Nombre/).fill(nombreRev)
    await page.getByLabel(/^Apellido/).fill(apellidoRev)
    await page.getByLabel(/^Email/).fill(emailRev)
    await page.getByRole('button', { name: 'Guardar' }).click()
    await page.waitForURL(/\/revendedoras(\?|$)/)

    // 2. Verificar tarjetas de resumen KPI
    await expect(page.getByText(/Mercadería en revendedoras/i)).toBeVisible()
    await expect(page.getByText(/Total adeudado al local/i)).toBeVisible()
    await expect(page.getByText(/Liquidaciones pendientes/i)).toBeVisible()
    await expect(page.getByText('Declaraciones pendientes', { exact: true })).toBeVisible()

    // 3. Verificar fila en la tabla del panel
    const filaRev = page.getByRole('row', { name: new RegExp(`${nombreRev} ${apellidoRev}`) })
    await expect(filaRev).toBeVisible()
    await expect(filaRev.getByText('Activa')).toBeVisible()
    await expect(filaRev.getByText('Al día')).toBeVisible()

    // 4. Filtrar por búsqueda
    const searchInput = page.getByPlaceholder(/Buscar por nombre, apellido/i)
    await searchInput.fill(nombreRev)
    await page.getByRole('button', { name: 'Aplicar filtros' }).click()
    await page.waitForURL(/q=/)
    await expect(filaRev).toBeVisible()

    // Limpiar filtro
    await page.getByRole('button', { name: 'Limpiar' }).click()
    await page.waitForURL(/\/revendedoras(\?|$)/)
    await expect(filaRev).toBeVisible()

    // 5. Exportar CSV
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exportar CSV' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^panel-revendedoras-\d{4}-\d{2}-\d{2}\.csv$/)
  })

  test('consignación de ítem: ficha de inventario muestra quién lo tiene y pestaña en su poder lo lista', async ({
    page,
    shell,
    nuevoProducto,
    controlPrecios,
    seed,
  }) => {
    // 1. Crear producto con stock y precio
    const nombreProd = unique('Vestido Panel')
    await nuevoProducto.crear({
      nombre: nombreProd,
      categoria: seed.categoriaSimple.nombre,
      costo: '15000',
      stock: 1,
    })
    await page.waitForURL(/\/inventario(\?|$)/)
    await controlPrecios.recalcular(nombreProd)

    // 2. Crear revendedora
    await page.goto('/revendedoras/nuevo')
    const nombreRev = unique('Carla')
    const apellidoRev = 'Tenencia'
    const emailRev = `${nombreRev.toLowerCase().replace(/\s+/g, '')}@test.com`

    await page.getByLabel(/^Nombre/).fill(nombreRev)
    await page.getByLabel(/^Apellido/).fill(apellidoRev)
    await page.getByLabel(/^Email/).fill(emailRev)
    await page.getByRole('button', { name: 'Guardar' }).click()
    await page.waitForURL(/\/revendedoras(\?|$)/)

    const filaRev = page.getByRole('row', { name: new RegExp(`${nombreRev} ${apellidoRev}`) })
    await expect(filaRev).toBeVisible()
    await filaRev.getByRole('link', { name: new RegExp(`${nombreRev} ${apellidoRev}`) }).click()
    await page.waitForURL(/\/revendedoras\/[0-9a-f-]+/)
    const revendedoraUrl = page.url()
    const idRevendedora = revendedoraUrl.split('/revendedoras/')[1]?.split('?')[0]?.split('/')[0]

    // 3. Consignar ítem y confirmar entrega
    await page.goto(`/revendedoras/${idRevendedora}/consignaciones/nueva`)
    await page.getByLabel(/Escanear o ingresar código/i).fill(nombreProd)
    await page.getByRole('button', { name: 'Agregar ítem' }).click()
    await expect(page.getByText(nombreProd)).toBeVisible()
    await page.getByRole('button', { name: 'Guardar borrador' }).click()

    await page.waitForURL(/\/revendedoras\/[0-9a-f-]+\/consignaciones\/[0-9a-f-]+/)
    await page.getByRole('button', { name: /Confirmar entrega/i }).click()
    const dialogConfirmar = page.getByRole('dialog')
    await expect(dialogConfirmar).toBeVisible()
    await dialogConfirmar.getByRole('button', { name: 'Confirmar entrega' }).click()
    await shell.expectSuccessToast('Entrega confirmada')

    // Obtener el código de barras (QR) del ítem entregado desde la fila de la tabla
    const filaItemConsig = page.getByRole('row', { name: new RegExp(nombreProd) })
    const qrCode = (await filaItemConsig.locator('div.font-mono.text-xs.text-muted').innerText()).trim()

    // 4. Ir a la pestaña "En su poder" de la ficha de revendedora
    await page.goto(`/revendedoras/${idRevendedora}/en-poder`)
    await expect(page.getByText(nombreProd)).toBeVisible()
    await expect(page.getByText('1', { exact: true })).toBeVisible() // 1 pieza en su poder

    // 5. Ir a la pestaña "Declaraciones" (placeholder)
    await page.goto(`/revendedoras/${idRevendedora}/declaraciones`)
    await expect(page.getByText('Declaraciones de venta', { exact: true })).toBeVisible()
    await expect(page.getByText(/Slice 9b/i)).toBeVisible()

    // 6. Consultar la ficha del ítem en inventario: debe mostrar "En poder de revendedora"
    await page.goto(`/inventario/ficha/${encodeURIComponent(qrCode)}`)
    await expect(page.getByText('En poder de revendedora')).toBeVisible()
    await expect(page.getByText(`${nombreRev} ${apellidoRev}`)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ver revendedora' })).toBeVisible()
  })

  test('con el módulo revendedoras apagado, /revendedoras responde module-disabled', async ({
    page,
    administracion,
    shell,
  }) => {
    // 1. Deshabilitar el módulo Revendedoras desde Administración
    await administracion.abrirModulos()
    const fila = administracion.filaModulo('Revendedoras')
    await fila.getByRole('button', { name: 'Deshabilitar', exact: true }).click()
    await shell.expectSuccessToast('Módulo deshabilitado')

    try {
      // 2. Comprobar que una petición directa responde redirección con module-disabled
      const res = await page.request.get('/revendedoras', { maxRedirects: 0 })
      expect(res.status()).toBe(307)
      expect(res.headers()['location']).toBe('/?e=module-disabled')

      // 3. Al navegar por navegador, rebota fuera de revendedoras hacia /ventas
      await page.goto('/revendedoras')
      await expect(page).toHaveURL(/\/ventas$/)
    } finally {
      // 4. Restaurar el módulo para no afectar otros tests
      await administracion.abrirModulos()
      const filaRestaurar = administracion.filaModulo('Revendedoras')
      const habilitar = filaRestaurar.getByRole('button', { name: 'Habilitar', exact: true })
      if (await habilitar.isVisible()) {
        await habilitar.click()
        await shell.expectSuccessToast('Módulo habilitado')
      }
    }
  })
})
