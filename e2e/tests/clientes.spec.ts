import { expect, test, unique, uniqueEmail } from '../fixtures/test'

test.describe('Clientes', () => {
  test('crea un cliente y lo muestra en el listado', async ({ page, clientes, shell }) => {
    const nombre = unique('Cliente E2E')

    await clientes.abrir()
    await clientes.crear(nombre, { telefono: '+54 9 11 5555 4444', email: uniqueEmail('cliente') })

    await shell.expectSuccessToast('Cliente creado')
    await page.waitForURL(/\/clientes(\?|$)/)
    await expect(clientes.fila(nombre)).toBeVisible()
    await expect(clientes.fila(nombre).getByText('Activo')).toBeVisible()
  })

  test('rechaza un nombre demasiado corto sin llamar al servidor', async ({
    clientes,
  }) => {
    await clientes.abrir()
    await clientes.abrirNuevo()
    await clientes.nombre.fill('A')
    await clientes.guardar.click()

    await expect(clientes.errorNombre).toHaveText('Nombre muy corto')
    // Client-side guard: the modal stays open, so nothing was persisted. The
    // form has no route of its own — it is a modal over /clientes — so the URL
    // says nothing about whether the submit went through.
    await expect(clientes.modalNuevo).toBeVisible()
  })

  test('el buscador filtra por nombre y avisa cuando no hay coincidencias', async ({
    clientes,
    page,
  }) => {
    const nombre = unique('Buscable E2E')

    await clientes.abrir()
    await clientes.crear(nombre)
    await page.waitForURL(/\/clientes(\?|$)/)

    await clientes.buscar(nombre)
    await expect(clientes.fila(nombre)).toBeVisible()

    await clientes.buscar('zzz-no-existe-e2e')
    await expect(page.getByText('Sin resultados.')).toBeVisible()
  })

  test('desactiva y reactiva un cliente', async ({ clientes, page }) => {
    const nombre = unique('Alternable E2E')

    await clientes.abrir()
    await clientes.crear(nombre)
    await page.waitForURL(/\/clientes(\?|$)/)
    await clientes.buscar(nombre)

    const fila = clientes.fila(nombre)
    await fila.getByRole('button', { name: 'Desactivar', exact: true }).click()
    await expect(fila.getByText('Inactivo')).toBeVisible()

    await fila.getByRole('button', { name: 'Activar', exact: true }).click()
    await expect(fila.getByText('Activo')).toBeVisible()
  })
})
