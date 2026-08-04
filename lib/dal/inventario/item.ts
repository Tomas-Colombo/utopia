import 'server-only'
import { createServerClient } from '@/lib/dal/supabase'
import type {
  EstadoItem,
  ItemConProducto,
  ItemProductoRow,
  MovimientoItemRow,
} from '@/lib/types/inventario'

/**
 * Buscar item por QR (flujo de escaneo — anexo §5, punto 5). RLS scope-ea
 * automáticamente al tenant actual. Devuelve null si no existe o si existe
 * pero pertenece a otro tenant (RLS lo oculta).
 */
export async function findItemByQr(qr: string): Promise<ItemProductoRow | null> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('item_producto').select('*').eq('qr_code', qr).maybeSingle()
  if (error) throw new Error(`findItemByQr: ${error.message}`)
  return (data ?? null) as ItemProductoRow | null
}

/**
 * Ficha de item + producto + categoría + proveedor + movimientos
 * (Planificacion.txt Etapa 3 §69 "Ficha de producto con escaneo").
 */
export async function getItemConDetalle(idItem: string): Promise<ItemConProducto | null> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('item_producto')
    .select(`
      *,
      producto:producto(id_producto, nombre, sku,
        categoria:categoria(id_categoria, nombre)),
      ingreso:ingreso_mercaderia(
        proveedor:proveedor(id_proveedor, nombre, telefono))
    `)
    .eq('id_item', idItem)
    .maybeSingle()

  if (error) throw new Error(`getItemConDetalle: ${error.message}`)
  if (!data) return null

  const { data: movs, error: movErr } = await supabase
    .from('movimiento_item')
    .select('*')
    .eq('id_item', idItem)
    .order('ts', { ascending: false })
  if (movErr) throw new Error(`getItemConDetalle movs: ${movErr.message}`)

  const proveedor = (data as { ingreso: { proveedor: ItemConProducto['proveedor'] } | null })
    .ingreso?.proveedor ?? null

  return {
    ...(data as ItemProductoRow),
    producto: (data as unknown as { producto: ItemConProducto['producto'] }).producto,
    proveedor,
    movimientos: (movs ?? []) as MovimientoItemRow[],
  }
}

/**
 * Proveedor "habitual" de un producto: el del ingreso más reciente entre sus
 * ítems. Es una regla de negocio (mono-proveedor por producto) que no está
 * enforced en DB, así que la derivamos por historial. Devuelve null si el
 * producto todavía no tiene ítems o si sus ingresos fueron sin proveedor.
 */
export async function getProveedorHabitualDeProducto(
  idProducto: string,
): Promise<{ id_proveedor: string; nombre: string } | null> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('item_producto')
    .select('ingreso:ingreso_mercaderia!inner(proveedor:proveedor(id_proveedor, nombre))')
    .eq('id_producto', idProducto)
    .order('fecha_ingreso', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`getProveedorHabitualDeProducto: ${error.message}`)
  const prov = (data as { ingreso: { proveedor: { id_proveedor: string; nombre: string } | null } } | null)
    ?.ingreso?.proveedor
  return prov ?? null
}

/**
 * Contexto del último ingreso de un producto: proveedor, tipo (compra o
 * consignación) y costo unitario. Se usa para prefilear el restock — la
 * regla de negocio es que cada producto es mono-proveedor y suele repetir
 * modo de ingreso; el costo se anticipa con el histórico y el usuario lo
 * corrige si cambió. Devuelve null si el producto no tiene ítems.
 */
export async function getUltimoContextoIngresoProducto(
  idProducto: string,
): Promise<{
  proveedor: { id_proveedor: string; nombre: string } | null
  tipoIngreso: 'compra' | 'consignacion'
  costoUnitario: number
} | null> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('item_producto')
    .select(
      'tipo_ingreso, costo_ingreso, ingreso:ingreso_mercaderia!inner(proveedor:proveedor(id_proveedor, nombre))',
    )
    .eq('id_producto', idProducto)
    .order('fecha_ingreso', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`getUltimoContextoIngresoProducto: ${error.message}`)
  if (!data) return null
  const row = data as unknown as {
    tipo_ingreso: 'compra' | 'consignacion'
    costo_ingreso: number | string
    ingreso: { proveedor: { id_proveedor: string; nombre: string } | null } | null
  }
  return {
    proveedor: row.ingreso?.proveedor ?? null,
    tipoIngreso: row.tipo_ingreso,
    costoUnitario: Number(row.costo_ingreso),
  }
}

/**
 * Asigna talles retroactivamente a ítems que se ingresaron sin talle y siguen
 * disponibles. Delega al RPC `sp_asignar_talles_a_producto` (migration 00044):
 * ese RPC valida el cupo, respeta FIFO, y registra ajuste + auditoría.
 */
export async function spAsignarTallesAProducto(input: {
  idProducto: string
  distribucion: Array<{ talle: string; cantidad: number }>
}): Promise<{ actualizados: number }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('sp_asignar_talles_a_producto', {
    p_id_producto: input.idProducto,
    p_distribucion: input.distribucion,
  })
  if (error) throw new Error(`sp_asignar_talles_a_producto: ${error.message}`)
  return { actualizados: Number(data ?? 0) }
}

export async function listItemsByProducto(idProducto: string): Promise<ItemProductoRow[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('item_producto')
    .select('*')
    .eq('id_producto', idProducto)
    .order('fecha_ingreso', { ascending: false })
  if (error) throw new Error(`listItemsByProducto: ${error.message}`)
  return (data ?? []) as ItemProductoRow[]
}

/**
 * Unidades `disponible` de un producto (opcionalmente de un talle), ordenadas
 * FIFO (más viejo primero). Se usa al cargar una venta por SKU: un SKU apunta
 * al producto/variante, no a una unidad, así que hay que elegir una unidad
 * concreta. El talle se compara case-insensitive (ilike sin comodines).
 */
/**
 * Filtro de talle para `listItemsDisponibles`:
 *   - `undefined` → no filtra por talle (cualquiera)
 *   - `null`      → sólo unidades SIN talle asignado (talle IS NULL)
 *   - `"M"`       → sólo unidades de ese talle (case-insensitive)
 */
export async function listItemsDisponibles(
  idProducto: string,
  talle?: string | null,
): Promise<ItemProductoRow[]> {
  const supabase = await createServerClient()
  let query = supabase
    .from('item_producto')
    .select('*')
    .eq('id_producto', idProducto)
    .eq('estado_item', 'disponible')
    .order('fecha_ingreso', { ascending: true })
    .limit(25)
  if (talle === null) query = query.is('talle', null)
  else if (talle) query = query.ilike('talle', talle)
  const { data, error } = await query
  if (error) throw new Error(`listItemsDisponibles: ${error.message}`)
  return (data ?? []) as ItemProductoRow[]
}

/** Stock de un talle concreto (`null` = unidades sin talle asignado). */
export interface StockPorTalle {
  talle: string | null
  /** Unidades libres: ni reservadas por otro ni ya cargadas en el carrito. */
  disponibles: number
  /**
   * Unidades tomadas por una reserva activa ajena al contexto. Se informan
   * aparte en vez de desaparecer: el vendedor tiene que poder VER que el
   * talle existe pero está reservado.
   */
  reservados: number
}

/**
 * Stock disponible de un producto AGRUPADO POR TALLE.
 *
 * No usa `listItemsDisponibles`: esa función corta en 25 unidades FIFO, y con
 * un corte no se puede saber qué talles existen — si las 25 más viejas son
 * todas "M", el resto de los talles desaparece del mapa.
 *
 * Descuenta las unidades bloqueadas por una reserva activa, salvo las de
 * `idReservaCtx` (la reserva que se está cobrando) y las de `excluir`
 * (unidades que ya están en el carrito y por lo tanto no se pueden volver a
 * agregar).
 *
 * Delega en `sp_stock_por_talle` (00050): un round-trip y sólo viaja el
 * agregado. La versión anterior traía todas las unidades disponibles y después
 * mandaba sus id_item de vuelta en un `.in(...)` para cruzarlas contra
 * `detalle_reserva` — con 3000 unidades eran 3000 UUIDs en el query string y
 * el request moría con 414 URI Too Long.
 */
export async function contarDisponiblesPorTalle(
  idProducto: string,
  opts?: { idReservaCtx?: string | null; excluir?: string[] },
): Promise<{
  porTalle: StockPorTalle[]
  totalDisponible: number
  /** Reservas activas (distintas de `idReservaCtx`) que están bloqueando unidades. */
  reservasBloqueantes: string[]
}> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('sp_stock_por_talle', {
    p_id_producto: idProducto,
    p_id_reserva_ctx: opts?.idReservaCtx ?? null,
    p_excluir: opts?.excluir ?? [],
  })
  if (error) throw new Error(`sp_stock_por_talle: ${error.message}`)

  const r = (data ?? {}) as {
    porTalle?: StockPorTalle[]
    totalDisponible?: number | string
    reservasBloqueantes?: string[]
  }
  return {
    porTalle: r.porTalle ?? [],
    totalDisponible: Number(r.totalDisponible ?? 0),
    reservasBloqueantes: r.reservasBloqueantes ?? [],
  }
}

/**
 * Transición de estado — ÚNICO punto de entrada. Llama al RPC que valida
 * la máquina de estados en DB (is_transicion_item_valida). Cualquier
 * UPDATE directo de `estado_item` desde la app es un bug.
 */
export async function spTransicionItem(input: {
  idItem: string
  estadoHasta: EstadoItem
  tipoMovimiento: string
  referenciaId?: string | null
  referenciaTipo?: string | null
}): Promise<void> {
  const supabase = await createServerClient()
  const { error } = await supabase.rpc('sp_transicion_item_producto', {
    p_id_item: input.idItem,
    p_estado_hasta: input.estadoHasta,
    p_tipo_movimiento: input.tipoMovimiento,
    p_referencia_id: input.referenciaId ?? null,
    p_referencia_tipo: input.referenciaTipo ?? null,
  })
  if (error) throw new Error(`sp_transicion_item_producto: ${error.message}`)
}
