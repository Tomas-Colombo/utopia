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
  if (talle) query = query.ilike('talle', talle)
  const { data, error } = await query
  if (error) throw new Error(`listItemsDisponibles: ${error.message}`)
  return (data ?? []) as ItemProductoRow[]
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
