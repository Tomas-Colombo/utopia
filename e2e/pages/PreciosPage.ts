import { expect, type Locator, type Page } from '@playwright/test'
import { alerta, AppShell, contenido } from './AppShell'

/** `/precios/reglas` + `/precios/reglas/nueva`. */
export class ReglasPage {
  readonly shell: AppShell

  constructor(readonly page: Page) {
    this.shell = new AppShell(page)
  }

  async abrir(): Promise<void> {
    await this.page.goto('/precios/reglas')
    await expect(this.shell.titulo).toHaveText('Reglas de precios')
  }

  async abrirNueva(): Promise<void> {
    await this.page.goto('/precios/reglas/nueva')
    await expect(this.shell.titulo).toHaveText('Nueva regla de precio')
  }

  get nombre(): Locator {
    return contenido(this.page).getByLabel(/^Nombre/)
  }

  get tipoRegla(): Locator {
    return contenido(this.page).getByLabel(/^Tipo de regla/)
  }

  get alcance(): Locator {
    return contenido(this.page).getByLabel(/^Alcance/)
  }

  get tipoValor(): Locator {
    return contenido(this.page).getByLabel(/^Tipo de valor/)
  }

  get porcentaje(): Locator {
    return contenido(this.page).getByLabel(/^Porcentaje/)
  }

  get formaPago(): Locator {
    return contenido(this.page).getByLabel(/^Forma de pago/)
  }

  get categoria(): Locator {
    return contenido(this.page).getByLabel(/^Categoría/)
  }

  get guardar(): Locator {
    return this.page.getByRole('button', { name: /Crear regla|Creando/ })
  }

  /** Form-level failure banner (`role="alert"`), not a per-field message. */
  get error(): Locator {
    return alerta(this.page)
  }

  fila(nombre: string): Locator {
    return this.page.getByRole('row').filter({ hasText: nombre })
  }
}

/** `/precios/control` — recalculates `producto.precio_venta`. */
export class ControlPreciosPage {
  readonly shell: AppShell

  constructor(readonly page: Page) {
    this.shell = new AppShell(page)
  }

  async abrir(): Promise<void> {
    await this.page.goto('/precios/control')
    await expect(this.shell.titulo).toHaveText('Control de precios')
  }

  get buscador(): Locator {
    return this.page.getByRole('searchbox')
  }

  get estado(): Locator {
    return contenido(this.page).getByLabel('Estado de precio')
  }

  fila(nombre: string): Locator {
    return this.page.getByRole('row').filter({ hasText: nombre })
  }

  /**
   * A brand-new product has `precio_venta = null` until someone recalculates
   * it, which is the state the "sin precio" sale error depends on. The view
   * defaults to the "desactualizados" filter, which excludes those rows.
   */
  async recalcular(nombreProducto: string): Promise<void> {
    await this.abrir()
    await this.estado.selectOption({ label: 'Sin precio de venta' })
    await this.buscador.fill(nombreProducto)
    const fila = this.fila(nombreProducto)
    await expect(fila).toBeVisible()
    await fila.getByRole('button', { name: 'Recalcular' }).click()
    await this.shell.expectSuccessToast('Precio actualizado')
  }
}
