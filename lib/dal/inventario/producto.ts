import 'server-only'
import { createServerClient } from '@/lib/dal/supabase'
import type {
  ProductoConDetalle,
  ProductoRow,
  TipoIngreso,
} from '@/lib/types/inventario'

/** Default page size for the paginated product listing. */
export const PRODUCTOS_PAGE_SIZE = 50

export type ProductoRowConCategoria = ProductoRow & {
  categoria: { id_categoria: string; nombre: string } | null
}

export interface ListProductosOpts {
  search?: string
  idCategoria?: string
  soloActivos?: boolean
  /** 1-based page. Pagination only kicks in when both page & pageSize are set. */
  page?: number
  pageSize?: number
}

/**
 * Enriquece las filas base de `producto` con costo vigente y stock. Se hace
 * en un paso aparte (2 queries acotadas a los ids de la página) para no
 * cargar costos/items de TODA la tabla — clave cuando el listado pagina.
 */
async function hydrateProductos(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  rows: ProductoRowConCategoria[],
): Promise<ProductoConDetalle[]> {
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

/**
 * Núcleo compartido del listado maestro (producto+categoria, costo_vigente,
 * item_producto agregados en memoria). Devuelve la página pedida + el total
 * que matchea los filtros (para paginar). Sin `page`/`pageSize` trae todo.
 */
async function queryProductos(
  opts?: ListProductosOpts,
): Promise<{ rows: ProductoConDetalle[]; total: number }> {
  const supabase = await createServerClient()
  const paginate = opts?.page != null && opts?.pageSize != null

  let query = supabase
    .from('producto')
    .select('*, categoria:categoria(id_categoria, nombre)', paginate ? { count: 'exact' } : {})
    .order('nombre', { ascending: true })

  if (opts?.soloActivos) query = query.eq('activo', true)
  if (opts?.idCategoria) query = query.eq('id_categoria', opts.idCategoria)
  if (opts?.search && opts.search.trim().length > 0) {
    // Búsqueda case-insensitive en nombre o sku.
    const pat = `%${opts.search.trim()}%`
    query = query.or(`nombre.ilike.${pat},sku.ilike.${pat}`)
  }
  if (paginate) {
    const from = (opts!.page! - 1) * opts!.pageSize!
    query = query.range(from, from + opts!.pageSize! - 1)
  }

  const { data: productos, error, count } = await query
  if (error) throw new Error(`listProductosConDetalle: ${error.message}`)

  const baseRows = (productos ?? []) as ProductoRowConCategoria[]
  const rows = await hydrateProductos(supabase, baseRows)
  return { rows, total: paginate ? count ?? 0 : rows.length }
}

/**
 * Listado maestro de productos con costo vigente + categoría + stock (todo).
 *
 * Nota: se hacen 3 queries (producto+categoria, costo_vigente, item_producto)
 * y se agregan en memoria. Para la vista paginada usar
 * `listProductosConDetallePaginado` — esta trae la tabla completa y es la que
 * consumen los pickers/dashboard que necesitan todos los productos.
 */
export async function listProductosConDetalle(
  opts?: Omit<ListProductosOpts, 'page' | 'pageSize'>,
): Promise<ProductoConDetalle[]> {
  const { rows } = await queryProductos(opts)
  return rows
}

/**
 * Variante paginada del listado maestro: trae solo `pageSize` filas y el
 * total de coincidencias, para no cargar toda la tabla en la vista de lista.
 */
export async function listProductosConDetallePaginado(opts: {
  search?: string
  idCategoria?: string
  soloActivos?: boolean
  page: number
  pageSize: number
}): Promise<{ rows: ProductoConDetalle[]; total: number }> {
  return queryProductos(opts)
}

/**
 * Cifras rápidas del módulo (KPIs de la home) sin cargar toda la tabla
 * hidratada: 2 queries de columnas mínimas (producto: id+stock_minimo;
 * item_producto: solo los `disponible`), agregadas en memoria. Reemplaza el
 * `listProductosConDetalle()` completo, que traía costos + categoría + todos
 * los items solo para estos totales.
 */
export async function getInventarioResumen(): Promise<{
  productosActivos: number
  stockDisponibleTotal: number
  productosBajoMinimo: number
}> {
  const supabase = await createServerClient()

  const { data: productos, error: pErr } = await supabase
    .from('producto')
    .select('id_producto, stock_minimo')
    .eq('activo', true)
  if (pErr) throw new Error(`getInventarioResumen productos: ${pErr.message}`)

  const activos = productos ?? []
  const ids = activos.map((p) => p.id_producto as string)

  const disponiblesPorProducto = new Map<string, number>()
  let stockDisponibleTotal = 0
  if (ids.length > 0) {
    const { data: items, error: iErr } = await supabase
      .from('item_producto')
      .select('id_producto')
      .in('id_producto', ids)
      .eq('estado_item', 'disponible')
    if (iErr) throw new Error(`getInventarioResumen items: ${iErr.message}`)

    for (const it of items ?? []) {
      const key = it.id_producto as string
      disponiblesPorProducto.set(key, (disponiblesPorProducto.get(key) ?? 0) + 1)
      stockDisponibleTotal += 1
    }
  }

  const productosBajoMinimo = activos.filter(
    (p) => (disponiblesPorProducto.get(p.id_producto as string) ?? 0) < Number(p.stock_minimo),
  ).length

  return {
    productosActivos: activos.length,
    stockDisponibleTotal,
    productosBajoMinimo,
  }
}

export async function getProducto(id: string): Promise<ProductoRow | null> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('producto').select('*').eq('id_producto', id).maybeSingle()
  if (error) throw new Error(`getProducto: ${error.message}`)
  return (data ?? null) as ProductoRow | null
}

/**
 * Busca un producto por su SKU exacto (scope-eado al tenant por RLS). Se usa
 * en el fallback de búsqueda manual sin escáner: el vendedor tipea el SKU
 * corto (ej: REM-0007) impreso/anotado y llega al producto.
 */
export async function findProductoBySku(
  sku: string,
): Promise<ProductoRowConCategoria | null> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('producto')
    .select('*, categoria:categoria(id_categoria, nombre)')
    .eq('sku', sku)
    .maybeSingle()
  if (error) throw new Error(`findProductoBySku: ${error.message}`)
  return (data ?? null) as ProductoRowConCategoria | null
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
 * Genera stock inicial (items físicos con QR) para un producto, sin pasar
 * por un ingreso. `items` = pares talle/cantidad. Devuelve cuántos se crearon.
 */
export async function spCrearStockDirecto(input: {
  idProducto: string
  costo?: number
  tipoIngreso?: TipoIngreso
  items: Array<{ talle: string | null; cantidad: number }>
}): Promise<number> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('sp_crear_stock_directo', {
    p_id_producto: input.idProducto,
    p_costo: input.costo ?? 0,
    p_tipo_ingreso: input.tipoIngreso ?? 'compra',
    p_items: input.items,
  })
  if (error) throw new Error(`sp_crear_stock_directo: ${error.message}`)
  return data as number
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
    es_nuevo?: boolean
  },
): Promise<void> {
  const supabase = await createServerClient()
  const { error } = await supabase.from('producto').update(patch).eq('id_producto', id)
  if (error) throw new Error(`updateProducto: ${error.message}`)
}
