import { alerta, badge } from '../pages/AppShell'
import { expect, test, unique } from '../fixtures/test'

test.describe('Inventario · categorías', () => {
  test('crea una categoría con talles desde el modal', async ({ categorias, shell }) => {
    const nombre = unique('Categoría E2E')

    await categorias.abrir()
    await categorias.abrirNueva()
    await categorias.nombre.fill(nombre)
    await categorias.talles.fill('S')
    await categorias.talles.press('Enter')
    await categorias.talles.fill('M')
    await categorias.talles.press('Enter')
    await categorias.guardar()

    await shell.expectSuccessToast('Categoría creada')
    await expect(categorias.modal).toBeHidden()

    const fila = categorias.fila(nombre)
    await expect(fila).toBeVisible()
    await expect(fila.getByText('S', { exact: true })).toBeVisible()
    await expect(fila.getByText('M', { exact: true })).toBeVisible()
  })

  test('rechaza un nombre corto y deja el modal abierto', async ({ categorias }) => {
    await categorias.abrir()
    await categorias.abrirNueva()
    await categorias.nombre.fill('A')
    await categorias.guardar()

    await expect(alerta(categorias.modal)).toHaveText('Mínimo 2 caracteres')
    await expect(categorias.modal).toBeVisible()
  })

  test('desactiva y reactiva una categoría', async ({ categorias }) => {
    const nombre = unique('Categoría alternable')

    await categorias.abrir()
    await categorias.abrirNueva()
    await categorias.nombre.fill(nombre)
    await categorias.guardar()
    await expect(categorias.modal).toBeHidden()

    const fila = categorias.fila(nombre)
    await fila.getByRole('button', { name: 'Desactivar', exact: true }).click()
    await expect(badge(fila)).toContainText('Inactiva')

    await fila.getByRole('button', { name: 'Activar', exact: true }).click()
    await expect(badge(fila)).toContainText('Activa')
  })
})

test.describe('Inventario · productos', () => {
  test('crea un producto con stock inicial y lo lista', async ({
    page,
    nuevoProducto,
    inventario,
    shell,
    seed,
  }) => {
    const nombre = unique('Producto E2E')

    await nuevoProducto.crear({
      nombre,
      categoria: seed.categoriaSimple.nombre,
      costo: '10000',
      stock: 3,
      stockMinimo: '1',
    })

    await shell.expectSuccessToast('Producto creado')
    await page.waitForURL(/\/inventario(\?|$)/)

    await inventario.filtrar(nombre)
    const fila = inventario.fila(nombre)
    await expect(fila).toBeVisible()
    // 3 units in stock against a minimum of 1.
    await expect(fila.getByText('3 / 1')).toBeVisible()
  })

  test('bloquea un nombre de producto duplicado', async ({ nuevoProducto, seed, page }) => {
    const nombre = unique('Producto duplicado')

    await nuevoProducto.crear({ nombre, categoria: seed.categoriaSimple.nombre, costo: '5000' })
    await page.waitForURL(/\/inventario(\?|$)/)

    await nuevoProducto.abrir()
    await nuevoProducto.nombre.fill(nombre)

    await expect(alerta(page)).toHaveText('Ya existe un producto con ese nombre')
    await expect(nuevoProducto.guardar).toBeDisabled()
  })

  test('avisa cuando la suma de talles supera el stock total declarado', async ({
    nuevoProducto,
    seed,
    page,
  }) => {
    await nuevoProducto.abrir()
    await nuevoProducto.nombre.fill(unique('Producto exceso'))
    await nuevoProducto.categoria.selectOption({ label: seed.categoriaConTalles.nombre })
    await nuevoProducto.stockTotalDeclarado.fill('1')
    await nuevoProducto.cargarStock(3, 'S')

    await expect(alerta(page)).toContainText(
      'La suma de talles (3) supera el stock total declarado (1)',
    )
    await expect(nuevoProducto.guardar).toBeDisabled()
  })

  test('el filtro del listado descarta lo que no coincide', async ({
    nuevoProducto,
    inventario,
    seed,
    page,
  }) => {
    const nombre = unique('Producto filtrable')

    await nuevoProducto.crear({ nombre, categoria: seed.categoriaSimple.nombre, costo: '7000' })
    await page.waitForURL(/\/inventario(\?|$)/)

    await inventario.filtrar('zzz-no-existe-e2e')
    await expect(page.getByText('Sin productos que coincidan con los filtros')).toBeVisible()

    await inventario.filtrar(nombre)
    await expect(inventario.fila(nombre)).toBeVisible()
  })
})
