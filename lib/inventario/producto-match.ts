import type { ProductoConDetalle } from '@/lib/types/inventario'

/**
 * Normaliza nombres para el match: minúsculas, sin acentos, espacios
 * colapsados. Se usa para decidir si un nombre escrito a mano (o leído de un
 * PDF) corresponde a un producto que ya existe en el inventario.
 */
export function normalizar(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // saca acentos (combining marks)
    .replace(/\s+/g, ' ')
}

/**
 * Índice nombre-normalizado → producto existente. Ante nombres duplicados se
 * queda con el primero (el listado ya viene ordenado por el server).
 */
export function indexarPorNombre(
  productos: ProductoConDetalle[],
): Map<string, ProductoConDetalle> {
  const m = new Map<string, ProductoConDetalle>()
  for (const p of productos) {
    const k = normalizar(p.nombre)
    if (!m.has(k)) m.set(k, p)
  }
  return m
}

/**
 * Busca el producto existente cuyo nombre coincide (normalizado) con el texto
 * dado. Devuelve `null` si el nombre está vacío o no matchea nada: en ese caso
 * el nombre es único y el producto se trata como nuevo.
 */
export function buscarMatchNombre(
  index: Map<string, ProductoConDetalle>,
  nombre: string,
): ProductoConDetalle | null {
  const k = normalizar(nombre)
  if (!k) return null
  return index.get(k) ?? null
}
