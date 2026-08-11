import { expect, type Locator, type Page } from '@playwright/test'
import { AppShell, contenido } from './AppShell'

/**
 * `/inventario` — module home: product list with search + filters, and the
 * entry points to products, entries and categories.
 */
export class InventarioPage {
  readonly shell: AppShell

  constructor(readonly page: Page) {
    this.shell = new AppShell(page)
  }

  async abrir(): Promise<void> {
    await this.page.goto('/inventario')
    await expect(this.shell.titulo).toHaveText('Inventario')
  }

  get buscador(): Locator {
    return contenido(this.page).getByLabel('Buscar producto')
  }

  get aplicar(): Locator {
    return this.page.getByRole('button', { name: 'Aplicar' })
  }

  fila(nombre: string): Locator {
    return this.page.getByRole('row').filter({ hasText: nombre })
  }

  /**
   * Types into the search box and commits via the Aplicar button.
   *
   * The button (not Enter) on purpose: with suggestions open the form's submit
   * picks the highlighted suggestion, and free text falls through to the QR
   * route. Aplicar always means "filter the table by this text".
   */
  async filtrar(termino: string): Promise<void> {
    await this.buscador.fill(termino)
    await this.buscador.press('Escape')
    await this.aplicar.click()
    await this.page.waitForURL(/\/inventario(\?|$)/)
  }

  async limpiarFiltro(): Promise<void> {
    await this.buscador.fill('')
    await this.aplicar.click()
    await this.page.waitForURL(/\/inventario(\?|$)/)
  }
}

/** `/inventario/productos/nuevo`. */
export class NuevoProductoPage {
  readonly shell: AppShell

  constructor(readonly page: Page) {
    this.shell = new AppShell(page)
  }

  async abrir(): Promise<void> {
    await this.page.goto('/inventario/productos/nuevo')
    await expect(this.shell.titulo).toHaveText('Nuevo producto')
  }

  get nombre(): Locator {
    return contenido(this.page).getByLabel(/^Nombre/)
  }

  get categoria(): Locator {
    return contenido(this.page).getByLabel(/^Categoría/)
  }

  get stockMinimo(): Locator {
    return contenido(this.page).getByLabel(/^Stock mínimo/)
  }

  get costoInicial(): Locator {
    return contenido(this.page).getByLabel(/^Costo inicial/)
  }

  get stockTotalDeclarado(): Locator {
    return contenido(this.page).getByLabel(/^Stock total inicial/)
  }

  /** Quantity box of the `StockTalleLoader` (labelled `aria-label`). */
  get cantidadStock(): Locator {
    return contenido(this.page).getByLabel('Cantidad')
  }

  get talleStock(): Locator {
    return contenido(this.page).getByLabel('Talle')
  }

  get agregarStock(): Locator {
    return this.page.getByRole('button', { name: 'Agregar' })
  }

  get guardar(): Locator {
    return this.page.getByRole('button', { name: /Crear producto|Guardando/ })
  }

  /** Adds N units of a size (or of the untyped bucket when `talle` is null). */
  async cargarStock(cantidad: number, talle: string | null = null): Promise<void> {
    await this.cantidadStock.fill(String(cantidad))
    await this.talleStock.selectOption(talle === null ? { label: 'Sin talle' } : { label: talle })
    await this.agregarStock.click()
    await expect(
      this.page.getByRole('button', { name: `Quitar ${talle ?? 'sin talle'}` }),
    ).toBeVisible()
  }

  /**
   * Full creation flow. `stock` units are loaded without a size, which keeps
   * the sale path free of the size picker for products in a size-less
   * category.
   */
  async crear(input: {
    nombre: string
    categoria: string
    costo?: string
    stock?: number
    stockMinimo?: string
  }): Promise<void> {
    await this.abrir()
    await this.nombre.fill(input.nombre)
    await this.categoria.selectOption({ label: input.categoria })
    if (input.stockMinimo) await this.stockMinimo.fill(input.stockMinimo)
    if (input.costo) await this.costoInicial.fill(input.costo)
    if (input.stock) await this.cargarStock(input.stock)
    await this.guardar.click()
  }
}

/** `/inventario/categorias` — modal-driven CRUD. */
export class CategoriasPage {
  readonly shell: AppShell

  constructor(readonly page: Page) {
    this.shell = new AppShell(page)
  }

  async abrir(): Promise<void> {
    await this.page.goto('/inventario/categorias')
    await expect(this.shell.titulo).toHaveText('Categorías')
  }

  get modal(): Locator {
    return this.page.getByRole('dialog')
  }

  get nombre(): Locator {
    return this.modal.getByLabel(/^Nombre/)
  }

  get talles(): Locator {
    return this.modal.getByLabel(/^Talles/)
  }

  fila(nombre: string): Locator {
    return this.page.getByRole('row').filter({ hasText: nombre })
  }

  async abrirNueva(): Promise<void> {
    await this.page.getByRole('button', { name: 'Nueva categoría' }).first().click()
    await expect(this.modal).toBeVisible()
  }

  async guardar(): Promise<void> {
    await this.modal.getByRole('button', { name: /^(Crear|Guardar|Guardando)/ }).click()
  }
}
