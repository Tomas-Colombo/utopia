import 'server-only'
import { createServerClient } from '@/lib/dal/supabase'
import type {
  ProductoConDetalle,
  ProductoRow,
} from '@/lib/types/inventario'

/**
 * Listado maestro de productos con costo vigente + categoría + stock.
 *
 * Nota: se hacen 3 queries (producto+categoria, costo_vigente, item_producto)
 * en paralelo y se agregan en memoria. Cuando la tabla crezca, migrar a
 * una vista SQL (design §124 hint). Por ahora prioridad = velocidad de
 * implementación.
 */
export async function listProductosConDetalle(opts?: {
  search?: string
  idCategoria?: string
  soloActivos?: boolean
}): Promise<ProductoConDetalle[]> {
  const supabase = await createServerClient()

  let query = supabase
    .from('producto')
    .select('*, categoria:categoria(id_categoria, nombre)')
    .order('nombre', { ascending: true })

  if (opts?.soloActivos) query = query.eq('activo', true)
  if (opts?.idCategoria) query = query.eq('id_categoria', opts.idCategoria)
  if (opts?.search && opts.search.trim().length > 0) {
    // Búsqueda case-insensitive en nombre o sku.
    const pat = `%${opts.search.trim()}%`
    query = query.or(`nombre.ilike.${pat},sku.ilike.${pat}`)
  }

  const { data: productos, error } = await query
  if (error) throw new Error(`listProductosConDetalle: ${error.message}`)

  const rows = (productos ?? []) as Array<
    ProductoRow & { categoria: { id_categoria: string; nombre: string } | null }
  >
  if (rows.length === 0) return []

  const ids = rows.map((p) => p.id_producto)

  // Costos vigentes (una fila por producto donde vigente_hasta IS NULL).
  const { data: costos, error: costosErr } = await supabase
    .from('costo_producto')
    .select('id_producto, costo, moneda')
    .in('id_producto', ids)
    .is('vigente_hasta', null)
  if (costosErr) throw new Error(`listProductos costos: ${costosErr.message}`)

  const costoMap = new Map<string, { costo: number; moneda: string }>()
  for (const c of costos ?? []) {
    costoMap.set(c.id_producto as string, {
      costo: Number(c.costo),
      moneda: (c.moneda as string) ?? 'ARS',
    })
  }

  // Stock: cuento items por producto y estado. Devuelvo total y disponibles.
  const { data: items, error: itemsErr } = await supabase
    .from('item_producto')
    .select('id_producto, estado_item')
    .in('id_producto', ids)
  if (itemsErr) throw new Error(`listProductos items: ${itemsErr.message}`)

  const stockMap = new Map<string, { total: number; disponible: number }>()
  for (const it of items ?? []) {
    const key = it.id_producto as string
    const bucket = stockMap.get(key) ?? { total: 0, disponible: 0 }
    // "total" excluye baja/devuelto porque ya no están en inventario efectivo.
    if (it.estado_item !== 'baja' && it.estado_item !== 'devuelto') {
      bucket.total += 1
    }
    if (it.estado_item === 'disponible') bucket.disponible += 1
    stockMap.set(key, bucket)
  }

  return rows.map((p) => {
    const costo = costoMap.get(p.id_producto)
    const stock = stockMap.get(p.id_producto) ?? { total: 0, disponible: 0 }
    return {
      ...p,
      costo_vigente: costo?.costo ?? null,
      moneda_vigente: costo?.moneda ?? null,
      stock_disponible: stock.disponible,
      stock_total: stock.total,
    }
  })
}

export async function getProducto(id: string): Promise<ProductoRow | null> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('producto').select('*').eq('id_producto', id).maybeSingle()
  if (error) throw new Error(`getProducto: ${error.message}`)
  return (data ?? null) as ProductoRow | null
}

/**
 * Alta de producto vía RPC `sp_create_producto` (audit + creación en la
 * misma transacción). Devuelve el id_producto nuevo.
 */
export async function spCreateProducto(input: {
  idCategoria: string
  nombre: string
  sku?: string | null
  stockMinimo?: number
  descripcion?: string | null
}): Promise<string> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('sp_create_producto', {
    p_id_categoria: input.idCategoria,
    p_nombre: input.nombre,
    p_sku: input.sku ?? null,
    p_stock_minimo: input.stockMinimo ?? 0,
    p_descripcion: input.descripcion ?? null,
  })
  if (error) throw new Error(`sp_create_producto: ${error.message}`)
  return data as string
}

/**
 * Setea un nuevo costo vigente. Cierra el anterior automáticamente
 * (sp_set_costo_producto lo resuelve).
 */
export async function spSetCostoProducto(input: {
  idProducto: string
  costo: number
  moneda?: string
  motivo?: string | null
}): Promise<string> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('sp_set_costo_producto', {
    p_id_producto: input.idProducto,
    p_costo: input.costo,
    p_moneda: input.moneda ?? 'ARS',
    p_motivo: input.motivo ?? null,
  })
  if (error) throw new Error(`sp_set_costo_producto: ${error.message}`)
  return data as string
}

/** Update simple de metadatos (no toca costo — para eso está spSetCostoProducto). */
export async function updateProducto(
  id: string,
  patch: {
    nombre?: string
    sku?: string | null
    descripcion?: string | null
    stock_minimo?: number
    id_categoria?: string
    activo?: boolean
  },
): Promise<void> {
  const supabase = await createServerClient()
  const { error } = await supabase.from('producto').update(patch).eq('id_producto', id)
  if (error) throw new Error(`updateProducto: ${error.message}`)
}
