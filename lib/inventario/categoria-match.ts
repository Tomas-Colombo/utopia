import type { CategoriaRow } from '@/lib/types/inventario'
import { normalizar } from './producto-match'

/** Coincidencia mínima (en letras) para asociar un nombre a una categoría. */
export const MIN_COINCIDENCIA_CATEGORIA = 4

/** Longitud del prefijo común entre dos strings ya normalizados. */
function prefijoComun(a: string, b: string): number {
  const n = Math.min(a.length, b.length)
  let i = 0
  while (i < n && a[i] === b[i]) i++
  return i
}

/**
 * Sugiere la categoría de un producto nuevo a partir de su nombre. Elige la
 * categoría cuyo nombre comparte el prefijo más largo con la primera palabra
 * del producto, siempre que coincidan al menos `MIN_COINCIDENCIA_CATEGORIA`
 * letras. Así "campera" cae en "camperas" y "pant" en "pantalón", pero
 * "camisa" no se confunde con "campera" (comparten solo 3 letras).
 *
 * Si nada llega al mínimo, cae en la categoría "accesorios"; si tampoco existe,
 * en la primera categoría de la lista. Devuelve el `id_categoria` elegido, o
 * '' si no hay categorías.
 */
export function sugerirCategoria(nombre: string, categorias: CategoriaRow[]): string {
  if (categorias.length === 0) return ''

  const fallback =
    categorias.find((c) => normalizar(c.nombre).startsWith('accesor'))?.id_categoria ??
    categorias[0].id_categoria

  // Comparamos contra la primera palabra: "campera negra" → "campera".
  const primeraPalabra = normalizar(nombre).split(' ')[0] ?? ''
  if (primeraPalabra.length < MIN_COINCIDENCIA_CATEGORIA) return fallback

  let mejorId = fallback
  let mejorPrefijo = MIN_COINCIDENCIA_CATEGORIA - 1
  for (const c of categorias) {
    const p = prefijoComun(primeraPalabra, normalizar(c.nombre))
    if (p >= MIN_COINCIDENCIA_CATEGORIA && p > mejorPrefijo) {
      mejorPrefijo = p
      mejorId = c.id_categoria
    }
  }
  return mejorId
}
