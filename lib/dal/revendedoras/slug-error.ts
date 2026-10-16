/**
 * Traduce un error de Postgres/PostgREST al slug kebab-case que devuelve el
 * DAL (`{ ok: false, reason }`).
 *
 * Había cinco copias de esta función en `lib/dal/revendedoras/`, cada una con
 * sus casos especiales y con diferencias sutiles entre sí. Ahora el algoritmo
 * vive acá y cada archivo del DAL declara solo sus reglas, como datos: así el
 * test de slugs (`lib/errores/slugs-typescript.test.ts`) puede leerlas.
 */

export interface ReglaSlug {
  /** Slug que se devuelve cuando la regla coincide. */
  slug: string
  /** SQLSTATE de Postgres que mapea a este slug (p. ej. `23505`). */
  codigo?: string
  /** Fragmentos del mensaje que mapean a este slug. Por defecto, el slug mismo. */
  contiene?: readonly string[]
  /**
   * Devuelve la línea completa desde el slug (`precio-no-resoluble: producto
   * <id> (sin-precio-lista)`): `mensajeDeError` usa el detalle.
   */
  conDetalle?: boolean
}

interface Opciones {
  /** Acepta `_` en el slug genérico. Solo comisiones lo aceptaba. */
  guionBajo?: boolean
}

export function extractErrorSlug(
  error: unknown,
  reglas: readonly ReglaSlug[] = [],
  opciones: Opciones = {},
): string {
  if (!error) return 'error-desconocido'
  const errObj = typeof error === 'object' ? (error as Record<string, unknown>) : null
  const code = typeof errObj?.code === 'string' ? errObj.code : ''
  const msg = typeof errObj?.message === 'string' ? errObj.message : String(error)

  for (const regla of reglas) {
    const fragmentos = regla.contiene ?? [regla.slug]
    const porCodigo = regla.codigo !== undefined && code === regla.codigo
    const fragmento = fragmentos.find((f) => msg.includes(f))
    if (!porCodigo && fragmento === undefined) continue
    if (regla.conDetalle && fragmento !== undefined) {
      const linea = msg.slice(msg.indexOf(fragmento)).split('\n')[0]
      return linea.trim()
    }
    return regla.slug
  }

  // Quita el prefijo de la función que levantó el error ("sp_x: slug: detalle").
  const cleaned = msg.replace(/^.*(?:sp|rvp|rf|preview)_[a-zA-Z0-9_]+:\s*/, '').trim()
  const candidate = cleaned.split(':')[0]?.trim().toLowerCase() || ''
  const valido = opciones.guionBajo ? /^[a-z0-9_-]+$/ : /^[a-z0-9-]+$/

  return candidate && valido.test(candidate) ? candidate : 'error-desconocido'
}
