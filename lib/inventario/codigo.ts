/**
 * Interpretación de lo que el operador escanea o tipea en un buscador de ítem.
 *
 * Un código puede ser tres cosas: el QR de una unidad física (24 hex, generado
 * por la base), el SKU de un producto (`PREFIJO-####`, ver `sp_gen_sku`) con
 * un talle opcional pegado (`REM-0007-M`), o texto libre. Antes cada buscador
 * tenía su propia regex de SKU y no coincidían: la de revendedoras aceptaba
 * guiones dentro del SKU, así que `REM-0007-M` nunca separaba el talle.
 */

export interface SkuParseado {
  /** SKU del producto, en mayúsculas (así lo guarda `sp_gen_sku`). */
  baseSku: string
  /** Talle pegado al SKU, o `null` si no vino. */
  talle: string | null
}

const SKU_CON_TALLE = /^([A-Z]+-\d+)(?:-(.+))?$/

/**
 * Separa `REM-0007-M` en `{ baseSku: 'REM-0007', talle: 'M' }`. Un texto que
 * no tiene forma de SKU autogenerado se devuelve entero como `baseSku`: los
 * SKU cargados a mano no siguen el patrón y igual tienen que encontrarse.
 */
export function parsearSku(codigo: string): SkuParseado {
  const upper = codigo.trim().toUpperCase()
  const m = upper.match(SKU_CON_TALLE)
  return { baseSku: m?.[1] ?? upper, talle: m?.[2] ?? null }
}

/**
 * Escapa los comodines de LIKE para buscar el texto tal cual. Sin esto, un
 * `%` o un `_` tipeado matchea cualquier cosa.
 */
export function escaparPatronLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`)
}
