import { createServerClient } from '../supabase'
import type {
  ConsignacionRevendedoraConDetalle,
  ConsignacionRevendedoraListItem,
  StockPorTenenciaRow,
} from '../../types/revendedoras'
import type {
  CrearConsignacionRevendedoraPayload,
  EditarConsignacionRevendedoraPayload,
  RegistrarDevolucionRevendedoraPayload,
} from '../../validation/revendedoras'
import { calcularSnapshotPrecio } from '../precios/resolucion'
import { resolverCodigo } from '../inventario/codigo'
import { listItemsDisponibles } from '../inventario/item'
import type { ItemProductoRow } from '../../types/inventario'
import type { LineaCarrito } from '../../types/ventas'
import { extractErrorSlug, type ReglaSlug } from './slug-error'

const REGLAS_SLUG: readonly ReglaSlug[] = [
  {
    slug: 'item-ya-en-consignacion-revendedora',
    codigo: '23505',
    contiene: ['consignacion_revendedora_detalle_item_activo_uk'],
  },
]

export async function listConsignacionesRevendedora(
  idRevendedora: string
): Promise<ConsignacionRevendedoraListItem[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('consignacion_revendedora')
    .select(`
      id_consignacion_revendedora,
      id_revendedora,
      estado,
      confirmada,
      fecha_confirmacion,
      fecha_cierre,
      periodo_desde,
      periodo_hasta,
      observaciones,
      created_at,
      consignacion_revendedora_detalle (
        id_consignacion_revendedora_detalle,
        estado_detalle
      )
    `)
    .eq('id_revendedora', idRevendedora)
    .order('created_at', { ascending: false })

  if (error) throw error

  return ((data || []) as unknown as Array<{
    id_consignacion_revendedora: string
    id_revendedora: string
    estado: 'abierta' | 'cerrada'
    confirmada: boolean
    fecha_confirmacion: string | null
    fecha_cierre: string | null
    periodo_desde: string | null
    periodo_hasta: string | null
    observaciones: string | null
    created_at: string
    consignacion_revendedora_detalle: Array<{
      id_consignacion_revendedora_detalle: string
      estado_detalle: string
    }>
  }>).map((c) => {
    const detalles = c.consignacion_revendedora_detalle || []
    return {
      id_consignacion_revendedora: c.id_consignacion_revendedora,
      id_revendedora: c.id_revendedora,
      estado: c.estado,
      confirmada: c.confirmada,
      fecha_confirmacion: c.fecha_confirmacion,
      fecha_cierre: c.fecha_cierre,
      periodo_desde: c.periodo_desde,
      periodo_hasta: c.periodo_hasta,
      observaciones: c.observaciones,
      created_at: c.created_at,
      total_items: detalles.length,
      items_en_poder: detalles.filter((d) => d.estado_detalle === 'en_poder').length,
    }
  })
}

export async function getConsignacionRevendedoraConDetalle(
  idConsignacion: string
): Promise<ConsignacionRevendedoraConDetalle | null> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('consignacion_revendedora')
    .select(`
      id_consignacion_revendedora,
      id_tenant,
      id_revendedora,
      id_usuario_alta,
      periodo_desde,
      periodo_hasta,
      estado,
      confirmada,
      fecha_confirmacion,
      fecha_cierre,
      observaciones,
      created_at,
      updated_at,
      revendedora (
        nombre,
        apellido,
        telefono,
        email
      ),
      consignacion_revendedora_detalle (
        id_consignacion_revendedora_detalle,
        id_item,
        id_producto,
        estado_detalle,
        fecha_entrega,
        fecha_devolucion,
        motivo,
        created_at,
        item_producto (
          id_item,
          qr_code,
          talle,
          producto (
            nombre,
            sku,
            precio_venta
          )
        )
      )
    `)
    .eq('id_consignacion_revendedora', idConsignacion)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }

  type RawQueryData = {
    id_consignacion_revendedora: string
    id_tenant: string
    id_revendedora: string
    id_usuario_alta: string | null
    periodo_desde: string | null
    periodo_hasta: string | null
    estado: 'abierta' | 'cerrada'
    confirmada: boolean
    fecha_confirmacion: string | null
    fecha_cierre: string | null
    observaciones: string | null
    created_at: string
    updated_at: string
    revendedora: {
      nombre: string
      apellido: string
      telefono: string | null
      email: string | null
    } | null
    consignacion_revendedora_detalle: Array<{
      id_consignacion_revendedora_detalle: string
      id_item: string
      id_producto: string
      estado_detalle: 'pendiente' | 'en_poder' | 'vendido' | 'devuelto' | 'baja'
      fecha_entrega: string | null
      fecha_devolucion: string | null
      motivo: string | null
      created_at: string
      item_producto: {
        id_item: string
        qr_code: string | null
        talle: string | null
        producto: {
          nombre: string
          sku: string
          precio_venta: number | string
        } | null
      } | null
    }>
  }

  const raw = data as unknown as RawQueryData

  return {
    id_consignacion_revendedora: raw.id_consignacion_revendedora,
    id_tenant: raw.id_tenant,
    id_revendedora: raw.id_revendedora,
    id_usuario_alta: raw.id_usuario_alta,
    periodo_desde: raw.periodo_desde,
    periodo_hasta: raw.periodo_hasta,
    estado: raw.estado,
    confirmada: raw.confirmada,
    fecha_confirmacion: raw.fecha_confirmacion,
    fecha_cierre: raw.fecha_cierre,
    observaciones: raw.observaciones,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    revendedora: raw.revendedora || {
      nombre: '',
      apellido: '',
      telefono: null,
      email: null,
    },
    detalles: (raw.consignacion_revendedora_detalle || []).map((d) => ({
      id_consignacion_revendedora_detalle: d.id_consignacion_revendedora_detalle,
      id_item: d.id_item,
      id_producto: d.id_producto,
      codigo_barra: d.item_producto?.qr_code || null,
      sku: d.item_producto?.producto?.sku || '',
      nombre_producto: d.item_producto?.producto?.nombre || 'Producto',
      talle: d.item_producto?.talle || null,
      precio_actual: Number(d.item_producto?.producto?.precio_venta || 0),
      estado_detalle: d.estado_detalle,
      fecha_entrega: d.fecha_entrega,
      fecha_devolucion: d.fecha_devolucion,
      motivo: d.motivo,
      created_at: d.created_at,
    })),
  }
}

export type LookupItemResult =
  | {
      ok: true
      data: {
        id_item: string
        id_producto: string
        nombre_producto: string
        codigo_barra: string | null
        sku: string
        talle: string | null
        precio_actual: number
      }
    }
  | {
      ok: false
      reason: string
      estado?: string
    }

export async function lookupItemParaConsignacionRevendedora(
  qr: string,
  idRevendedora: string
): Promise<LookupItemResult> {
  const supabase = await createServerClient()

  if (idRevendedora) {
    const { data: rev, error: revError } = await supabase
      .from('revendedora')
      .select('activo')
      .eq('id_revendedora', idRevendedora)
      .maybeSingle()

    if (revError) throw revError
    if (!rev) return { ok: false, reason: 'revendedora-not-found' }
    if (!rev.activo) return { ok: false, reason: 'revendedora-inactiva' }
  }

  // QR exacto, SKU (con talle opcional) o nombre de producto.
  const resuelto = await resolverCodigo(qr, { nombre: true })
  if (!resuelto) return { ok: false, reason: 'item-not-found' }

  let candidatos: ItemProductoRow[]
  if (resuelto.tipo === 'item') {
    if (resuelto.item.estado_item !== 'disponible') {
      return { ok: false, reason: 'item-no-disponible', estado: resuelto.item.estado_item }
    }
    candidatos = [resuelto.item]
  } else {
    // Sin talle en el código vale cualquier unidad (`undefined`), no sólo las
    // que no tienen talle (`null`).
    candidatos = await listItemsDisponibles(
      resuelto.producto.id_producto,
      resuelto.talle ?? undefined,
    )
    if (candidatos.length === 0) return { ok: false, reason: 'item-not-found' }
  }

  // Por SKU o nombre se toma la primera unidad libre. Antes se tomaba la
  // primera disponible y, si estaba reservada, se rechazaba el código aunque
  // hubiera otras unidades libres del mismo producto.
  const bloqueos = await motivosDeBloqueo(candidatos.map((c) => c.id_item))
  const item = candidatos.find((c) => !bloqueos.has(c.id_item))
  if (!item) {
    return { ok: false, reason: bloqueos.get(candidatos[0].id_item) ?? 'item-not-found' }
  }

  const producto =
    resuelto.tipo === 'producto'
      ? resuelto.producto
      : await getProductoParaLookup(supabase, item.id_producto)

  return {
    ok: true,
    data: {
      id_item: item.id_item,
      id_producto: item.id_producto,
      nombre_producto: producto?.nombre || 'Producto',
      codigo_barra: item.qr_code,
      sku: producto?.sku || '',
      talle: item.talle || null,
      precio_actual: Number(producto?.precio_venta || 0),
    },
  }
}

async function getProductoParaLookup(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  idProducto: string,
): Promise<{ nombre: string; sku: string | null; precio_venta: number | null } | null> {
  const { data, error } = await supabase
    .from('producto')
    .select('nombre, sku, precio_venta')
    .eq('id_producto', idProducto)
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * Por qué no se puede consignar cada ítem: reserva activa, consignación de
 * proveedor pendiente o consignación de revendedora abierta. Tres consultas
 * para todos los candidatos juntos, no tres por candidato.
 */
async function motivosDeBloqueo(ids: string[]): Promise<Map<string, string>> {
  const supabase = await createServerClient()
  const [reservas, consigProv, consigRev] = await Promise.all([
    supabase.from('detalle_reserva').select('id_item').in('id_item', ids).eq('estado', 'activa'),
    supabase
      .from('consignacion_detalle')
      .select('id_item')
      .in('id_item', ids)
      .eq('estado', 'pendiente'),
    supabase
      .from('consignacion_revendedora_detalle')
      .select('id_item')
      .in('id_item', ids)
      .in('estado_detalle', ['pendiente', 'en_poder']),
  ])
  for (const r of [reservas, consigProv, consigRev]) if (r.error) throw r.error

  const filas = (r: { data: unknown }) => (r.data ?? []) as { id_item: string }[]
  // Se cargan de menor a mayor prioridad para que gane el mismo motivo que
  // devolvían los chequeos secuenciales de antes: la reserva primero.
  const motivos = new Map<string, string>()
  for (const f of filas(consigRev)) motivos.set(f.id_item, 'item-ya-en-consignacion-revendedora')
  for (const f of filas(consigProv)) motivos.set(f.id_item, 'item-ya-en-consignacion-pendiente')
  for (const f of filas(reservas)) motivos.set(f.id_item, 'item-en-reserva')
  return motivos
}

export async function lookupItemParaVentaRevendedora(
  code: string | undefined,
  idRevendedora: string,
  idProducto?: string,
  excluir: string[] = [],
): Promise<
  | {
      ok: true
      data: {
        item: {
          id_item: string
          id_producto: string
          nombre_producto: string
          qr_code: string
          sku: string | null
          talle: string | null
          precio_actual: number
        }
        linea: LineaCarrito
      }
    }
  | { ok: false; reason: string }
> {
  const supabase = await createServerClient()

  if (!code && !idProducto) {
    return { ok: false, reason: 'qr-vacio' }
  }

  if (!idRevendedora) {
    return { ok: false, reason: 'revendedora-requerida' }
  }

  const { data: rev, error: revError } = await supabase
    .from('revendedora')
    .select('activo')
    .eq('id_revendedora', idRevendedora)
    .maybeSingle()

  if (revError) throw revError
  if (!rev) return { ok: false, reason: 'revendedora-not-found' }
  if (!rev.activo) return { ok: false, reason: 'revendedora-inactiva' }

  let itemId: string | null = null
  let prodId: string | null = idProducto ?? null

  if (code) {
    const resuelto = await resolverCodigo(code, { nombre: true })
    if (resuelto?.tipo === 'item') itemId = resuelto.item.id_item
    else if (resuelto && !prodId) prodId = resuelto.producto.id_producto
  }

  if (!itemId && prodId) {
    const { data: itemsCandidatos, error: candErr } = await supabase
      .from('consignacion_revendedora_detalle')
      .select(`
        id_item,
        consignacion_revendedora!inner (
          id_revendedora,
          confirmada,
          estado
        ),
        item:item_producto!inner (
          id_item,
          id_producto,
          estado_item
        )
      `)
      .eq('consignacion_revendedora.id_revendedora', idRevendedora)
      .eq('consignacion_revendedora.confirmada', true)
      .eq('consignacion_revendedora.estado', 'abierta')
      .eq('estado_detalle', 'en_poder')
      .eq('item.id_producto', prodId)
      .eq('item.estado_item', 'en_revendedora')
      .limit(25)
    if (candErr) throw candErr

    // `excluir` son las unidades que ya están en el carrito. Sin saltearlas,
    // la segunda unidad del mismo producto devolvía otra vez la primera y el
    // carrito la rebotaba como duplicada.
    const excluidos = new Set(excluir)
    itemId =
      ((itemsCandidatos ?? []) as { id_item: string }[]).find((c) => !excluidos.has(c.id_item))
        ?.id_item ?? null
  }

  if (!itemId) {
    return { ok: false, reason: 'item-not-found' }
  }

  const { data: itemCompleto, error: errComp } = await supabase
    .from('item_producto')
    .select(`
      id_item,
      id_producto,
      qr_code,
      talle,
      estado_item,
      producto (
        id_producto,
        nombre,
        sku,
        precio_venta,
        categoria (
          id_categoria,
          nombre
        )
      )
    `)
    .eq('id_item', itemId)
    .maybeSingle()

  if (errComp) throw errComp
  if (!itemCompleto) return { ok: false, reason: 'item-not-found' }

  if (itemCompleto.estado_item !== 'en_revendedora') {
    return { ok: false, reason: 'item-no-en-revendedora' }
  }

  const { data: detalleConsig } = await supabase
    .from('consignacion_revendedora_detalle')
    .select(`
      id_consignacion_revendedora_detalle,
      consignacion_revendedora!inner (
        id_revendedora,
        confirmada,
        estado
      )
    `)
    .eq('id_item', itemId)
    .eq('estado_detalle', 'en_poder')
    .eq('consignacion_revendedora.id_revendedora', idRevendedora)
    .eq('consignacion_revendedora.confirmada', true)
    .eq('consignacion_revendedora.estado', 'abierta')
    .maybeSingle()

  if (!detalleConsig) {
    return { ok: false, reason: 'item-no-en-revendedora' }
  }

  type ProductoRel = {
    id_producto: string
    nombre: string
    sku: string | null
    precio_venta: number | null
    categoria: { id_categoria: string; nombre: string } | null
  } | null

  const prod = itemCompleto.producto as unknown as ProductoRel
  const snap = await calcularSnapshotPrecio({
    idProducto: itemCompleto.id_producto,
    formaPago: 'efectivo',
  })

  if (!snap.ok) {
    return { ok: false, reason: snap.reason }
  }

  const linea: LineaCarrito = {
    id_item: itemCompleto.id_item,
    id_producto: itemCompleto.id_producto,
    qr_code: itemCompleto.qr_code,
    talle: itemCompleto.talle ?? null,
    producto_nombre: prod?.nombre ?? '(producto sin nombre)',
    sku: prod?.sku ?? null,
    categoria_nombre: prod?.categoria?.nombre ?? null,
    precio_lista: snap.precio_lista,
    precio_final: snap.precio_final,
    desactualizado: snap.desactualizado,
    desglose: snap.desglose,
    advertencia: null,
  }

  return {
    ok: true,
    data: {
      item: {
        id_item: itemCompleto.id_item,
        id_producto: itemCompleto.id_producto,
        nombre_producto: prod?.nombre ?? '(producto sin nombre)',
        qr_code: itemCompleto.qr_code,
        sku: prod?.sku ?? null,
        talle: itemCompleto.talle ?? null,
        precio_actual: snap.precio_final,
      },
      linea,
    },
  }
}

export async function listItemsElegiblesConsignacionRevendedora(
  search?: string
): Promise<
  Array<{
    id_item: string
    id_producto: string
    nombre_producto: string
    codigo_barra: string | null
    sku: string
    talle: string | null
    precio_actual: number
  }>
> {
  const supabase = await createServerClient()
  let query = supabase
    .from('item_producto')
    .select(`
      id_item,
      id_producto,
      qr_code,
      talle,
      estado_item,
      producto!inner (
        nombre,
        sku,
        precio_venta
      )
    `)
    .eq('estado_item', 'disponible')
    .limit(50)

  if (search && search.trim()) {
    const s = search.trim()
    query = query.or(`qr_code.ilike.%${s}%,producto.sku.ilike.%${s}%,producto.nombre.ilike.%${s}%`)
  }

  const { data, error } = await query
  if (error) throw error

  type RawItem = {
    id_item: string
    id_producto: string
    qr_code: string
    talle: string | null
    producto: {
      nombre: string
      sku: string | null
      precio_venta: number | null
    }
  }

  return ((data || []) as unknown as RawItem[]).map((i) => ({
    id_item: i.id_item,
    id_producto: i.id_producto,
    nombre_producto: i.producto.nombre,
    codigo_barra: i.qr_code,
    sku: i.producto.sku || '',
    talle: i.talle,
    precio_actual: Number(i.producto.precio_venta || 0),
  }))
}

export async function obtenerStockPorTenencia(
  idProducto?: string
): Promise<StockPorTenenciaRow[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('rf_stock_por_tenencia', {
    p_id_producto: idProducto || null,
  })

  if (error) {
    if (error.message.includes('modulo-revendedoras-deshabilitado')) {
      return []
    }
    throw error
  }

  return ((data || []) as Array<{
    id_producto: string
    disponible_central: number | string
    reservado_central: number | string
    en_revendedoras: number | string
    por_revendedora: Record<string, number> | null
  }>).map((row) => ({
    id_producto: row.id_producto,
    disponible_central: Number(row.disponible_central),
    reservado_central: Number(row.reservado_central),
    en_revendedoras: Number(row.en_revendedoras),
    por_revendedora: row.por_revendedora,
  }))
}

export async function crearConsignacionRevendedora(
  payload: CrearConsignacionRevendedoraPayload
): Promise<{ ok: true; id_consignacion_revendedora: string } | { ok: false; reason: string }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('sp_crear_consignacion_revendedora_con_items', {
    p_id_revendedora: payload.id_revendedora,
    p_items: payload.items,
    p_periodo_desde: payload.periodo_desde || null,
    p_periodo_hasta: payload.periodo_hasta || null,
    p_observaciones: payload.observaciones || null,
    p_motivo: payload.motivo || null,
  })

  if (error) {
    return { ok: false, reason: extractErrorSlug(error, REGLAS_SLUG) }
  }

  return { ok: true, id_consignacion_revendedora: data as string }
}

export async function editarConsignacionRevendedora(
  payload: EditarConsignacionRevendedoraPayload
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const supabase = await createServerClient()
  const { error } = await supabase.rpc('sp_editar_consignacion_revendedora', {
    p_id_consignacion_revendedora: payload.id_consignacion_revendedora,
    p_observaciones: payload.observaciones || null,
    p_periodo_desde: payload.periodo_desde || null,
    p_periodo_hasta: payload.periodo_hasta || null,
  })

  if (error) {
    return { ok: false, reason: extractErrorSlug(error, REGLAS_SLUG) }
  }

  return { ok: true }
}

export async function confirmarConsignacionRevendedora(
  idConsignacion: string
): Promise<{ ok: true; itemsConfirmados: number } | { ok: false; reason: string }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('sp_confirmar_consignacion_revendedora', {
    p_id_consignacion_revendedora: idConsignacion,
  })

  if (error) {
    return { ok: false, reason: extractErrorSlug(error, REGLAS_SLUG) }
  }

  return { ok: true, itemsConfirmados: Number(data) }
}

export async function registrarDevolucionRevendedora(
  payload: RegistrarDevolucionRevendedoraPayload
): Promise<{ ok: true; itemsDevueltos: number } | { ok: false; reason: string }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('sp_registrar_devolucion_revendedora', {
    p_id_consignacion_revendedora: payload.id_consignacion_revendedora,
    p_items: payload.items,
    p_estado_destino: payload.estado_destino,
    p_motivo: payload.motivo || null,
  })

  if (error) {
    return { ok: false, reason: extractErrorSlug(error, REGLAS_SLUG) }
  }

  return { ok: true, itemsDevueltos: Number(data) }
}

export async function cerrarConsignacionRevendedora(
  idConsignacion: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const supabase = await createServerClient()
  const { error } = await supabase.rpc('sp_cerrar_consignacion_revendedora', {
    p_id_consignacion_revendedora: idConsignacion,
  })

  if (error) {
    return { ok: false, reason: extractErrorSlug(error, REGLAS_SLUG) }
  }

  return { ok: true }
}

export async function eliminarConsignacionRevendedora(
  idConsignacion: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const supabase = await createServerClient()
  const { error } = await supabase.rpc('sp_eliminar_consignacion_revendedora', {
    p_id_consignacion_revendedora: idConsignacion,
  })

  if (error) {
    return { ok: false, reason: extractErrorSlug(error, REGLAS_SLUG) }
  }

  return { ok: true }
}
