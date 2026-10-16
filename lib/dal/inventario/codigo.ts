import { createServerClient } from '../supabase'
import { escaparPatronLike, parsearSku } from '../../inventario/codigo'
import type { ItemProductoRow } from '../../types/inventario'
import { findItemByQr } from './item'
import { findProductoBySku, type ProductoRowConCategoria } from './producto'

export type CodigoResuelto =
  | { tipo: 'item'; item: ItemProductoRow }
  | { tipo: 'producto'; producto: ProductoRowConCategoria; talle: string | null }

/**
 * Único resolvedor de "lo que se escaneó o tipeó" en un buscador de ítem.
 * Orden: QR exacto (una unidad), SKU con talle opcional (un producto) y, si
 * el llamador lo pide, nombre de producto.
 *
 * Qué unidad se toma de un producto lo decide cada flujo (venta, consignación,
 * revendedora), porque cada uno tiene su propia idea de "disponible".
 *
 * Antes había cuatro copias de esto. Dos armaban `.or(\`sku.eq.${code},...\`)`
 * con el texto del operador: una coma o un paréntesis tipeado reescribía el
 * filtro de PostgREST. Acá cada búsqueda es un filtro separado.
 */
export async function resolverCodigo(
  codigo: string,
  opts: {
    /** `false` = sólo QR exacto (el refresco de precios del carrito). */
    sku?: boolean
    /** Buscar también por nombre de producto si no fue QR ni SKU. */
    nombre?: boolean
  } = {},
): Promise<CodigoResuelto | null> {
  const texto = codigo.trim()
  if (!texto) return null

  const item = await findItemByQr(texto)
  if (item) return { tipo: 'item', item }
  if (opts.sku === false) return null

  const { baseSku, talle } = parsearSku(texto)
  const porSku = await findProductoBySku(baseSku)
  if (porSku) return { tipo: 'producto', producto: porSku, talle }

  if (!opts.nombre) return null
  const porNombre = await findProductoPorNombre(texto)
  return porNombre ? { tipo: 'producto', producto: porNombre, talle: null } : null
}

/**
 * Primer producto cuyo nombre contiene el texto. Es un respaldo para tipear
 * sin lector: con varios matches gana el primero alfabético, que es al menos
 * determinístico (antes era el que devolviera Postgres).
 */
async function findProductoPorNombre(texto: string): Promise<ProductoRowConCategoria | null> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('producto')
    .select('*, categoria:categoria(id_categoria, nombre)')
    .ilike('nombre', `%${escaparPatronLike(texto)}%`)
    .order('nombre', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`findProductoPorNombre: ${error.message}`)
  return (data ?? null) as ProductoRowConCategoria | null
}
