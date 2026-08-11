import { expect, type Locator, type Page } from '@playwright/test'
import { alerta, AppShell, contenido } from './AppShell'

/** `/gastos` list + `/gastos/nuevo` form. */
export class GastosPage {
  readonly shell: AppShell

  constructor(readonly page: Page) {
    this.shell = new AppShell(page)
  }

  async abrir(): Promise<void> {
    await this.page.goto('/gastos')
    await expect(this.shell.titulo).toHaveText('Gastos')
  }

  async abrirNuevo(): Promise<void> {
    await this.page.goto('/gastos/nuevo')
    await expect(this.shell.titulo).toHaveText('Nuevo gasto')
  }

  get categoria(): Locator {
    return contenido(this.page).getByLabel(/^Categoría/)
  }

  get monto(): Locator {
    return contenido(this.page).getByLabel(/^Monto/)
  }

  get fecha(): Locator {
    return contenido(this.page).getByLabel(/^Fecha/)
  }

  get descripcion(): Locator {
    return contenido(this.page).getByLabel(/^Descripción/)
  }

  get guardar(): Locator {
    return this.page.getByRole('button', { name: /Registrar gasto|Guardando/ })
  }

  /** Form-level banner (`role="alert"`) used for monto/categoría failures. */
  get error(): Locator {
    return alerta(this.page)
  }

  fila(texto: string): Locator {
    return this.page.getByRole('row').filter({ hasText: texto })
  }

  async registrar(input: {
    categoria: string
    monto: string
    descripcion?: string
  }): Promise<void> {
    await this.abrirNuevo()
    await this.categoria.selectOption({ label: input.categoria })
    await this.monto.fill(input.monto)
    if (input.descripcion) await this.descripcion.fill(input.descripcion)
    await this.guardar.click()
  }
}
