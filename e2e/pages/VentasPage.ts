import { expect, type Locator, type Page } from '@playwright/test'
import { alerta, AppShell, contenido } from './AppShell'

/** `/ventas` — module home: period filter, KPIs and the sales table. */
export class VentasPage {
  readonly shell: AppShell

  constructor(readonly page: Page) {
    this.shell = new AppShell(page)
  }

  async abrir(): Promise<void> {
    await this.page.goto('/ventas')
    await expect(this.shell.titulo).toHaveText('Ventas')
  }

  get tablaPeriodo(): Locator {
    return this.page.getByRole('table')
  }

  fila(texto: string): Locator {
    return this.page.getByRole('row').filter({ hasText: texto })
  }
}

/**
 * `/ventas/nueva` — the cart.
 *
 * Two steps by design: the cart is built on the page, and confirmation only
 * exists inside the Cobranza modal. The page object mirrors that split so a
 * spec cannot accidentally "confirm" without going through collection.
 */
export class NuevaVentaPage {
  readonly shell: AppShell

  constructor(readonly page: Page) {
    this.shell = new AppShell(page)
  }

  async abrir(): Promise<void> {
    await this.page.goto('/ventas/nueva')
    await expect(this.shell.titulo).toHaveText('Nueva venta')
  }

  get buscador(): Locator {
    return contenido(this.page).getByLabel(/^Escanear, tipear código/)
  }

  get agregar(): Locator {
    return this.page.getByRole('button', { name: /^(Agregar|Buscando)/ })
  }

  /** Field-level failure of the lookup (`role="alert"` under the input). */
  get errorBusqueda(): Locator {
    return alerta(this.page)
  }

  get lineas(): Locator {
    return this.page.getByTestId('linea-carrito')
  }

  get total(): Locator {
    return this.page.getByTestId('venta-total')
  }

  get continuarAlCobro(): Locator {
    return this.page.getByRole('button', { name: /Continuar al cobro|Registrando/ })
  }

  get modalCobranza(): Locator {
    return this.page.getByRole('dialog')
  }

  get confirmar(): Locator {
    return this.modalCobranza.getByRole('button', { name: /^Confirmar venta/ })
  }

  /**
   * Adds a unit by free text (QR, SKU or product name).
   *
   * `Escape` closes the live-suggestion list first: with it open the form's
   * submit picks the highlighted suggestion instead of the typed code, which
   * would silently resolve a different product than the spec asked for.
   */
  async agregarPorTexto(codigo: string): Promise<void> {
    await this.buscador.fill(codigo)
    await this.buscador.press('Escape')
    await this.agregar.click()
  }

  /** Picks a product from the live suggestion list by name. */
  async agregarPorSugerencia(nombre: string): Promise<void> {
    await this.buscador.fill(nombre)
    const opcion = this.page.getByRole('option', { name: new RegExp(nombre) }).first()
    await expect(opcion).toBeVisible()
    await opcion.click()
  }

  async cobrarYConfirmar(): Promise<void> {
    await this.continuarAlCobro.click()
    await expect(this.modalCobranza).toBeVisible()
    await expect(this.confirmar).toBeEnabled()
    await this.confirmar.click()
  }
}
