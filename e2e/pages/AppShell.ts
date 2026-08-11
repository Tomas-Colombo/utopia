import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Every in-app error message renders as `role="alert"` — but so does Next.js's
 * own route announcer (`#__next-route-announcer__`), which is present on every
 * page and empty. A bare `getByRole('alert')` therefore always resolves to two
 * elements and trips strict mode. This is the alert locator the suite uses.
 */
export function alerta(scope: Page | Locator): Locator {
  return scope.locator('[role="alert"]:not(#__next-route-announcer__)')
}

/**
 * The page content region (`<main>`).
 *
 * Form queries MUST be scoped here. Sidebar links carry `aria-label`s like
 * "Proveedores", "Clientes" or "Ingresos", so a page-wide `getByLabel(/^Prove/)`
 * matches the nav link as well as the field and trips strict mode. Content
 * rendered through a Portal (modals) lives outside `<main>` and is scoped to
 * its dialog instead.
 */
export function contenido(page: Page): Locator {
  return page.locator('main')
}

/**
 * The status `<Badge>` inside a table row.
 *
 * Badges prepend a screen-reader prefix ("Success: Activa"), so their text is
 * never exactly the visible word, and the row itself also holds an
 * "Activar"/"Desactivar" button that a substring match would pick up. Scoping
 * to the badge removes both ambiguities.
 */
export function badge(fila: Locator): Locator {
  return fila.locator('span[data-variant]')
}

/**
 * Fills a React-controlled input so that REACT sees the change, not just the DOM.
 *
 * Two separate races live here, and only one of them is about hydration:
 *
 *   1. A fill that lands between first paint and hydration is written to the
 *      DOM and then thrown away by the first client render, leaving the field
 *      on its server-rendered default. Retrying until the value sticks removes
 *      that one.
 *
 *   2. React attaches a `_valueTracker` to every controlled input and, on each
 *      `input` event, compares the node's value against it — if they match, it
 *      treats the event as a no-op and never calls `onChange`. Assigning
 *      `el.value` goes THROUGH that tracker, so it updates itself and React
 *      concludes nothing changed. The DOM then shows the new value while
 *      React's state still holds the old one, and any handler reading state
 *      (`ReportesPeriodoForm` submits `apply(d, h)`) silently uses the stale
 *      value. Asserting `toHaveValue` does not catch this: the DOM is right.
 *
 * Calling the setter off `HTMLInputElement.prototype` bypasses the instance's
 * tracker override, so the tracker keeps the OLD value, the dispatched `input`
 * event registers as a real change, and `onChange` runs.
 *
 * This is a harness fix, not an app bug: real typing and real date-picker
 * interaction dispatch trusted events that React always sees.
 */
export async function fillEstable(locator: Locator, value: string): Promise<void> {
  await expect(async () => {
    await locator.evaluate((el, v) => {
      const input = el as HTMLInputElement
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set
      nativeSetter?.call(input, v)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }, value)
    await expect(locator).toHaveValue(value, { timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
}

/**
 * The authenticated shell: sidebar navigation, topbar title and toasts.
 *
 * Every other page object composes this one instead of re-deriving the same
 * locators, so a change to the rail or the toast markup lands in one place.
 */
export class AppShell {
  constructor(readonly page: Page) {}

  /** `<h1>` inside the topbar — the page identity assertion for every route. */
  get titulo(): Locator {
    return this.page.getByRole('heading', { level: 1 })
  }

  /** Nav links carry `aria-label={label}`, so the accessible name is stable. */
  navLink(label: string): Locator {
    return this.page.getByRole('link', { name: label, exact: true })
  }

  get logout(): Locator {
    return this.page.getByRole('button', { name: 'Cerrar sesión' })
  }

  get themeToggle(): Locator {
    return this.page.getByRole('button', { name: /Modo (claro|oscuro)/ })
  }

  /**
   * Toasts. The live-region container also has `role="status"`, so an
   * accessibility query cannot address a single toast — hence the testid.
   */
  toast(variant: 'success' | 'error' | 'info'): Locator {
    return this.page.locator(`[data-testid="toast"][data-variant="${variant}"]`)
  }

  async expectSuccessToast(title: string | RegExp): Promise<void> {
    await expect(this.toast('success').filter({ hasText: title }).first()).toBeVisible()
  }

  async expectErrorToast(title: string | RegExp): Promise<void> {
    await expect(this.toast('error').filter({ hasText: title }).first()).toBeVisible()
  }

  async irA(label: string, expectedTitle: string | RegExp): Promise<void> {
    await this.navLink(label).click()
    await expect(this.titulo).toHaveText(expectedTitle)
  }

  async cerrarSesion(): Promise<void> {
    await this.logout.click()
    await this.page.waitForURL('**/login')
  }

  /** Current theme, read from the attribute the theme provider writes. */
  async temaActual(): Promise<string | null> {
    return this.page.locator('html').getAttribute('data-theme')
  }
}
