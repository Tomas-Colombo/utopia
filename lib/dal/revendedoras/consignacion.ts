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

export function extractErrorSlug(error: unknown): string {
  if (!error) return 'error-desconocido'
  const errObj = typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : null
  const code = typeof errObj?.code === 'string' ? errObj.code : ''
  const msg = typeof errObj?.message === 'string' ? errObj.message : String(error)

  if (code === '23505' || msg.includes('consignacion_revendedora_detalle_item_activo_uk')) {
    return 'item-ya-en-consignacion-revendedora'
  }

  // Remove potential Postgres prefix e.g. "sp_crear_consignacion_revendedora_con_items: "
  const cleaned = msg.replace(/^.*sp_[a-zA-Z0-9_]+:\s*/, '').trim()
  const candidate = cleaned.split(':')[0]?.trim().toLowerCase() || ''

  if (candidate && /^[a-z0-9-]+$/.test(candidate)) {
    return candidate
  }

  return 'error-desconocido'
}

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
          codigo_barra,
          sku,
          producto (
            nombre,
            precio_actual,
            talle
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
        codigo_barra: string | null
        sku: string
        producto: {
          nombre: string
          precio_actual: number
          talle: string | null
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
      codigo_barra: d.item_producto?.codigo_barra || null,
      sku: d.item_producto?.sku || '',
      nombre_producto: d.item_producto?.producto?.nombre || 'Producto',
      talle: d.item_producto?.producto?.talle || null,
      precio_actual: Number(d.item_producto?.producto?.precio_actual || 0),
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

  // 1. Buscar el item por qr o sku
  const { data: item, error: itemError } = await supabase
    .from('item_producto')
    .select(`
      id_item,
      id_producto,
      codigo_barra,
      sku,
      estado_item,
      producto (
        nombre,
        precio_actual,
        talle
      )
    `)
    .or(`codigo_barra.eq.${qr},sku.eq.${qr}`)
    .maybeSingle()

  if (itemError) throw itemError
  if (!item) return { ok: false, reason: 'item-not-found' }

  if (item.estado_item !== 'disponible') {
    return { ok: false, reason: 'item-no-disponible', estado: item.estado_item }
  }

  // 2. Verificar que no esté en una reserva activa
  const { data: reserva } = await supabase
    .from('detalle_reserva')
    .select('id_reserva')
    .eq('id_item', item.id_item)
    .eq('estado', 'activa')
    .limit(1)
    .maybeSingle()

  if (reserva) {
    return { ok: false, reason: 'item-en-reserva' }
  }

  // 3. Verificar que no esté apartado en consignación de proveedor
  const { data: consigProv } = await supabase
    .from('consignacion_detalle')
    .select('id_consignacion_detalle')
    .eq('id_item', item.id_item)
    .eq('estado', 'pendiente')
    .limit(1)
    .maybeSingle()

  if (consigProv) {
    return { ok: false, reason: 'item-ya-en-consignacion-pendiente' }
  }

  // 4. Verificar que no esté ya en consignación de revendedora activa
  const { data: consigRev } = await supabase
    .from('consignacion_revendedora_detalle')
    .select('id_consignacion_revendedora_detalle, estado_detalle')
    .eq('id_item', item.id_item)
    .in('estado_detalle', ['pendiente', 'en_poder'])
    .limit(1)
    .maybeSingle()

  if (consigRev) {
    return { ok: false, reason: 'item-ya-en-consignacion-revendedora' }
  }

  type ProductoRel = {
    nombre: string
    precio_actual: number
    talle: string | null
  } | null

  const prod = item.producto as unknown as ProductoRel

  return {
    ok: true,
    data: {
      id_item: item.id_item,
      id_producto: item.id_producto,
      nombre_producto: prod?.nombre || 'Producto',
      codigo_barra: item.codigo_barra,
      sku: item.sku,
      talle: prod?.talle || null,
      precio_actual: Number(prod?.precio_actual || 0),
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
      codigo_barra,
      sku,
      estado_item,
      producto!inner (
        nombre,
        precio_actual,
        talle
      )
    `)
    .eq('estado_item', 'disponible')
    .limit(50)

  if (search && search.trim()) {
    const s = search.trim()
    query = query.or(`codigo_barra.ilike.%${s}%,sku.ilike.%${s}%,producto.nombre.ilike.%${s}%`)
  }

  const { data, error } = await query
  if (error) throw error

  type RawItem = {
    id_item: string
    id_producto: string
    codigo_barra: string | null
    sku: string
    producto: {
      nombre: string
      precio_actual: number
      talle: string | null
    }
  }

  return ((data || []) as unknown as RawItem[]).map((i) => ({
    id_item: i.id_item,
    id_producto: i.id_producto,
    nombre_producto: i.producto.nombre,
    codigo_barra: i.codigo_barra,
    sku: i.sku,
    talle: i.producto.talle,
    precio_actual: Number(i.producto.precio_actual || 0),
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
    return { ok: false, reason: extractErrorSlug(error) }
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
    return { ok: false, reason: extractErrorSlug(error) }
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
    return { ok: false, reason: extractErrorSlug(error) }
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
    return { ok: false, reason: extractErrorSlug(error) }
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
    return { ok: false, reason: extractErrorSlug(error) }
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
    return { ok: false, reason: extractErrorSlug(error) }
  }

  return { ok: true }
}
