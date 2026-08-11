import { expect, type Locator, type Page } from '@playwright/test'
import { alerta, AppShell, contenido } from './AppShell'

/** `/clientes` list + `/clientes/nuevo` form. */
export class ClientesPage {
  readonly shell: AppShell

  constructor(readonly page: Page) {
    this.shell = new AppShell(page)
  }

  async abrir(): Promise<void> {
    await this.page.goto('/clientes')
    await expect(this.shell.titulo).toHaveText('Clientes')
  }

  async abrirNuevo(): Promise<void> {
    await this.page.getByRole('link', { name: 'Nuevo cliente' }).first().click()
    await expect(this.shell.titulo).toHaveText('Nuevo cliente')
  }

  /**
   * `<Field required>` appends a `*` marker inside the `<label>`, so the label
   * text is never exactly "Nombre". Anchored regexes match either shape.
   */
  get nombre(): Locator {
    return contenido(this.page).getByLabel(/^Nombre/)
  }

  get telefono(): Locator {
    return contenido(this.page).getByLabel('Teléfono')
  }

  get email(): Locator {
    return contenido(this.page).getByLabel('Email')
  }

  get guardar(): Locator {
    return this.page.getByRole('button', { name: /Crear cliente|Guardando/ })
  }

  /** Inline validation message rendered by `<Field error>`. */
  get errorNombre(): Locator {
    return alerta(this.page)
  }

  get buscador(): Locator {
    return this.page.getByRole('searchbox')
  }

  fila(nombre: string): Locator {
    return this.page.getByRole('row').filter({ hasText: nombre })
  }

  async crear(nombre: string, extra: { telefono?: string; email?: string } = {}): Promise<void> {
    await this.abrirNuevo()
    await this.nombre.fill(nombre)
    if (extra.telefono) await this.telefono.fill(extra.telefono)
    if (extra.email) await this.email.fill(extra.email)
    await this.guardar.click()
  }

  async buscar(termino: string): Promise<void> {
    await this.buscador.fill(termino)
    await this.page.getByRole('button', { name: 'Aplicar' }).click()
    await this.page.waitForURL(/\/clientes(\?|$)/)
  }
}
