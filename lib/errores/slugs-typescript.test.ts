import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MENSAJE_GENERICO, SLUGS_CON_MENSAJE, mensajeDeError } from './mensajes'

/**
 * Hermano de `slugs-migraciones.test.ts`, del lado de TypeScript: cada slug
 * literal que una action, el DAL o un schema de zod puede devolver como
 * `reason` tiene que traducirse a algo mejor que el mensaje genérico. Antes un
 * slug nuevo en una action pasaba en verde y el operador leía "Algo salió mal".
 *
 * Fuentes:
 *  - `reason: '<slug>'` en `app/**` y `lib/dal/**`;
 *  - `slug: '<slug>'` de las reglas de `extractErrorSlug` (lib/dal/revendedoras);
 *  - literales kebab-case de `lib/validation/**` (mensajes de zod que
 *    `primerReason` devuelve tal cual).
 */

const RAIZ = process.cwd()
const ES_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

/**
 * Slugs que se devuelven y NO tienen mensaje propio, con su razón. Solo puede
 * achicarse: el test falla si aparece uno nuevo y también si uno de estos ya
 * tiene mensaje o dejó de usarse.
 */
const SIN_MENSAJE: Record<string, string> = {}

/**
 * Claves del catálogo que no son kebab-case (prosa o snake_case heredados).
 * Solo puede achicarse: toda clave nueva tiene que ser un slug kebab-case.
 */
const CLAVES_NO_KEBAB: Record<string, string> = {
  regla_comision_general_no_solapada: 'nombre del constraint EXCLUDE de 00086',
  regla_comision_propia_no_solapada: 'nombre del constraint EXCLUDE de 00086',
}

function archivos(dir: string): string[] {
  return readdirSync(join(RAIZ, dir), { withFileTypes: true }).flatMap((e) => {
    const ruta = `${dir}/${e.name}`
    if (e.isDirectory()) return archivos(ruta)
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [ruta] : []
  })
}

function literales(dirs: string[], patron: RegExp): Map<string, string> {
  const encontrados = new Map<string, string>()
  for (const archivo of dirs.flatMap(archivos)) {
    const texto = readFileSync(join(RAIZ, archivo), 'utf8')
    for (const m of texto.matchAll(patron)) {
      if (ES_SLUG.test(m[1]) && !encontrados.has(m[1])) encontrados.set(m[1], archivo)
    }
  }
  return encontrados
}

function slugsDevueltos(): Map<string, string> {
  return new Map([
    ...literales(['app', 'lib/dal'], /\breason:\s*'([^']+)'/g),
    ...literales(['lib/dal/revendedoras'], /\bslug:\s*'([^']+)'/g),
    ...literales(['lib/validation'], /'([a-z0-9]+(?:-[a-z0-9]+)+)'/g),
  ])
}

const sinTraduccion = (slug: string) => mensajeDeError(slug) === MENSAJE_GENERICO

describe('slugs devueltos desde TypeScript', () => {
  const devueltos = slugsDevueltos()

  it('encuentra slugs (si no, el test no prueba nada)', () => {
    expect(devueltos.size).toBeGreaterThan(50)
  })

  it('cada slug devuelto tiene mensaje en el catálogo', () => {
    const faltan = [...devueltos]
      .filter(([slug]) => sinTraduccion(slug) && !(slug in SIN_MENSAJE))
      .map(([slug, archivo]) => `${slug} (${archivo})`)
    expect(faltan).toEqual([])
  })

  it('la lista SIN_MENSAJE solo tiene slugs que se usan y siguen sin mensaje', () => {
    const sobran = Object.keys(SIN_MENSAJE).filter((s) => !devueltos.has(s) || !sinTraduccion(s))
    expect(sobran).toEqual([])
  })
})

describe('claves del catálogo', () => {
  it('toda clave nueva es kebab-case', () => {
    const noKebab = SLUGS_CON_MENSAJE.filter((c) => !ES_SLUG.test(c) && !(c in CLAVES_NO_KEBAB))
    expect(noKebab).toEqual([])
  })

  it('la lista CLAVES_NO_KEBAB solo tiene claves que existen y siguen sin ser kebab-case', () => {
    const sobran = Object.keys(CLAVES_NO_KEBAB).filter((c) => !SLUGS_CON_MENSAJE.includes(c) || ES_SLUG.test(c))
    expect(sobran).toEqual([])
  })
})
