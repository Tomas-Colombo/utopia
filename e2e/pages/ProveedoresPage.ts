import { expect, type Locator, type Page } from '@playwright/test'
import { alerta, AppShell, contenido } from './AppShell'

/** `/proveedores` list + `/proveedores/nuevo` form. */
export class ProveedoresPage {
  readonly shell: AppShell

  constructor(readonly page: Page) {
    this.shell = new AppShell(page)
  }

  async abrir(): Promise<void> {
    await this.page.goto('/proveedores')
    await expect(this.shell.titulo).toHaveText('Proveedores')
  }

  async abrirNuevo(): Promise<void> {
    await this.page.getByRole('link', { name: 'Nuevo proveedor' }).first().click()
    await expect(this.shell.titulo).toHaveText('Nuevo proveedor')
  }

  get nombre(): Locator {
    return contenido(this.page).getByLabel(/^Nombre/)
  }

  get tipo(): Locator {
    return contenido(this.page).getByLabel(/^Tipo/)
  }

  get diasRotacion(): Locator {
    return contenido(this.page).getByLabel(/^Días de rotación/)
  }

  get telefono(): Locator {
    return contenido(this.page).getByLabel(/^Teléfono/)
  }

  get guardar(): Locator {
    return this.page.getByRole('button', { name: /Crear proveedor|Guardando/ })
  }

  get errorNombre(): Locator {
    return alerta(this.page)
  }

  fila(nombre: string): Locator {
    return this.page.getByRole('row').filter({ hasText: nombre })
  }

  async crear(
    nombre: string,
    opciones: { tipo?: string; dias?: string; telefono?: string } = {},
  ): Promise<void> {
    await this.abrirNuevo()
    await this.nombre.fill(nombre)
    if (opciones.tipo) await this.tipo.selectOption({ label: opciones.tipo })
    if (opciones.dias) await this.diasRotacion.fill(opciones.dias)
    if (opciones.telefono) await this.telefono.fill(opciones.telefono)
    await this.guardar.click()
  }
}
