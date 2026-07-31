import type { Theme } from './ThemeProvider'

export interface ThemeConfiguracionPayload {
  seccion: 'perfil'
  clave: 'theme'
  valor: Theme
}

/**
 * Builds the exact payload shape the `configuracion` DAL write consumes:
 * `configuracion(seccion='perfil', clave='theme', valor=theme)`
 * (design §8.6, REQ-DS-06). Pure and DB-free so the contract stays
 * unit-testable independent of the Supabase round-trip in
 * `persistThemePreference`. Lives outside that `'use server'` module because
 * Server Action files may only export async functions.
 */
export function buildThemeConfiguracionPayload(theme: Theme): ThemeConfiguracionPayload {
  return { seccion: 'perfil', clave: 'theme', valor: theme }
}
