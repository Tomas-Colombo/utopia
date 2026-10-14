import 'server-only'
import { createServerClient } from '@/lib/dal/supabase'
import type {
  PreviewLiquidacionPayload,
  GenerarLiquidacionPayload,
  ExcluirDetalleLiquidacionPayload,
  ReincluirDetalleLiquidacionPayload,
  MarcarLiquidacionPagadaPayload,
} from '@/lib/validation/revendedoras'
import type {
  CuentaCorrienteRevendedora,
  LiquidacionRevendedoraRow,
  PagoRevendedoraRow,
  PreviewLiquidacionResponse,
} from '@/lib/types/revendedoras'

function extractErrorSlug(error: { code?: string; message?: string }): string {
  const msg = error.message || ''
  const code = error.code || ''

  if (code === '42501' || msg.includes('no-permission')) return 'no-permission'
  if (msg.includes('modulo-revendedoras-deshabilitado')) return 'modulo-revendedoras-deshabilitado'
  if (msg.includes('revendedora-not-found')) return 'revendedora-not-found'
  if (msg.includes('liquidacion-vacia')) return 'liquidacion-vacia'
  if (msg.includes('detalle-not-found')) return 'detalle-not-found'
  if (msg.includes('detalle-ya-liquidado')) return 'detalle-ya-liquidado'
  if (msg.includes('liquidacion-no-encontrada')) return 'liquidacion-no-encontrada'
  if (msg.includes('liquidacion-ya-pagada')) return 'liquidacion-ya-pagada'
  if (msg.includes('cuenta-invalida-liquidacion')) return 'cuenta-invalida-liquidacion'
  if (msg.includes('monto-pago-invalido')) return 'monto-pago-invalido'

  const cleaned = msg.replace(/^.*(?:sp|preview|rf)_[a-zA-Z0-9_]+:\s*/, '').trim()
  const candidate = cleaned.split(':')[0]?.trim().toLowerCase() || ''

  if (candidate && /^[a-z0-9-]+$/.test(candidate)) {
    return candidate
  }

  return 'error-desconocido'
}

export async function previewLiquidacion(
  payload: PreviewLiquidacionPayload,
): Promise<{ ok: true; data: PreviewLiquidacionResponse } | { ok: false; reason: string }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('preview_liquidacion', {
    p_id_revendedora: payload.id_revendedora,
    p_desde: payload.desde,
    p_hasta: payload.hasta,
  })

  if (error) {
    return { ok: false, reason: extractErrorSlug(error) }
  }

  const res = data as PreviewLiquidacionResponse
  const lineas = res.lineas ?? []
  if (lineas.length === 0) {
    return { ok: true, data: res }
  }

  const itemIds = lineas.map((l) => l.id_item).filter(Boolean)
  const { data: itemsData } = await supabase
    .from('item_producto')
    .select(`
      id_item,
      producto:id_producto (
        nombre,
        sku
      )
    `)
    .in('id_item', itemIds)

  interface ItemJoinRow {
    id_item: string
    producto: { nombre: string; sku: string } | null
  }

  const itemsMap = new Map<string, { nombre: string; sku: string }>()
  for (const it of (itemsData as unknown as ItemJoinRow[]) ?? []) {
    itemsMap.set(it.id_item, {
      nombre: it.producto?.nombre ?? 'Producto',
      sku: it.producto?.sku ?? '',
    })
  }

  const porcentajeResuelto = Number(res.porcentaje_resuelto ?? 0)

  const hydratedLineas = lineas.map((l) => {
    const info = itemsMap.get(l.id_item)
    const precio = Number(l.precio_venta ?? 0)
    const comisionEst = Math.round(precio * (porcentajeResuelto / 100) * 100) / 100
    return {
      ...l,
      nombre_producto: info?.nombre ?? 'Producto',
      sku: info?.sku ?? '',
      monto_comision_estimada: comisionEst,
      porcentaje_preview: porcentajeResuelto,
    }
  })

  return {
    ok: true,
    data: {
      ...res,
      lineas: hydratedLineas,
    },
  }
}

export async function generarLiquidacion(
  payload: GenerarLiquidacionPayload,
): Promise<{ ok: true; data: string } | { ok: false; reason: string }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('sp_generar_liquidacion', {
    p_id_revendedora: payload.id_revendedora,
    p_desde: payload.desde,
    p_hasta: payload.hasta,
    p_observaciones: payload.observaciones ?? null,
  })

  if (error) {
    return { ok: false, reason: extractErrorSlug(error) }
  }

  return { ok: true, data: data as string }
}

export async function excluirDetalleLiquidacion(
  payload: ExcluirDetalleLiquidacionPayload,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const supabase = await createServerClient()
  const { error } = await supabase.rpc('sp_excluir_detalle_liquidacion', {
    p_id_detalle: payload.id_detalle,
    p_motivo: payload.motivo ?? null,
  })

  if (error) {
    return { ok: false, reason: extractErrorSlug(error) }
  }

  return { ok: true }
}

export async function reincluirDetalleLiquidacion(
  payload: ReincluirDetalleLiquidacionPayload,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const supabase = await createServerClient()
  const { error } = await supabase.rpc('sp_reincluir_detalle_liquidacion', {
    p_id_detalle: payload.id_detalle,
  })

  if (error) {
    return { ok: false, reason: extractErrorSlug(error) }
  }

  return { ok: true }
}

export async function marcarLiquidacionPagada(
  payload: MarcarLiquidacionPagadaPayload,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const supabase = await createServerClient()
  const { error } = await supabase.rpc('sp_marcar_liquidacion_pagada', {
    p_id_liquidacion: payload.id_liquidacion,
    p_id_cuenta: payload.id_cuenta,
    p_monto: payload.monto,
    p_metodo: payload.metodo ?? null,
    p_referencia: payload.referencia ?? null,
    p_fecha: payload.fecha ? new Date(payload.fecha).toISOString() : null,
  })

  if (error) {
    return { ok: false, reason: extractErrorSlug(error) }
  }

  return { ok: true }
}

export async function obtenerCuentaCorrienteRevendedora(
  idRevendedora: string,
): Promise<{ ok: true; data: CuentaCorrienteRevendedora } | { ok: false; reason: string }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .rpc('rf_cuenta_corriente_revendedora', {
      p_id_revendedora: idRevendedora,
    })
    .single()

  if (error) {
    return { ok: false, reason: extractErrorSlug(error) }
  }

  const row = data as Record<string, unknown>
  return {
    ok: true,
    data: {
      total_en_poder: Number(row.total_en_poder ?? 0),
      total_vendido: Number(row.total_vendido ?? 0),
      total_devuelto: Number(row.total_devuelto ?? 0),
      total_comision_liquidada: Number(row.total_comision_liquidada ?? 0),
      total_liquidado: Number(row.total_liquidado ?? 0),
      total_pagado: Number(row.total_pagado ?? 0),
      adeudado: Number(row.adeudado ?? 0),
    },
  }
}

export async function listarLiquidacionesRevendedora(
  idRevendedora: string,
): Promise<{ ok: true; data: LiquidacionRevendedoraRow[] } | { ok: false; reason: string }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('liquidacion_revendedora')
    .select('*')
    .eq('id_revendedora', idRevendedora)
    .order('periodo_desde', { ascending: false })
    .limit(200)

  if (error) {
    return { ok: false, reason: extractErrorSlug(error) }
  }

  return { ok: true, data: (data ?? []) as LiquidacionRevendedoraRow[] }
}

export interface LineaLiquidacionDetalle {
  id_detalle_venta: string
  id_venta: string
  precio_venta: number
  monto_comision: number
  porcentaje_comision_preview: number
  fecha_venta: string
  nombre_producto: string
  sku: string
}

export interface LiquidacionConDetalle {
  liquidacion: LiquidacionRevendedoraRow
  pagos: PagoRevendedoraRow[]
  lineas: LineaLiquidacionDetalle[]
}

export async function obtenerLiquidacionConDetalle(
  idLiquidacion: string,
): Promise<{ ok: true; data: LiquidacionConDetalle } | { ok: false; reason: string }> {
  const supabase = await createServerClient()
  const { data: liq, error: liqErr } = await supabase
    .from('liquidacion_revendedora')
    .select('*, pago_revendedora(*)')
    .eq('id_liquidacion', idLiquidacion)
    .single()

  if (liqErr) {
    return { ok: false, reason: extractErrorSlug(liqErr) }
  }

  const { data: lineasData, error: lineasErr } = await supabase
    .from('detalle_venta')
    .select(`
      id_detalle_venta,
      id_venta,
      precio_venta,
      monto_comision,
      porcentaje_comision_preview,
      venta:id_venta (fecha),
      producto:id_producto (nombre, sku)
    `)
    .eq('id_liquidacion', idLiquidacion)

  if (lineasErr) {
    return { ok: false, reason: extractErrorSlug(lineasErr) }
  }

  interface DetalleVentaRowJoin {
    id_detalle_venta: string
    id_venta: string
    precio_venta: number | string | null
    monto_comision: number | string | null
    porcentaje_comision_preview: number | string | null
    venta: { fecha: string } | null
    producto: { nombre: string; sku: string } | null
  }

  const rawLineas = (lineasData as unknown as DetalleVentaRowJoin[]) ?? []
  const lineas: LineaLiquidacionDetalle[] = rawLineas.map((row) => ({
    id_detalle_venta: row.id_detalle_venta,
    id_venta: row.id_venta,
    precio_venta: Number(row.precio_venta ?? 0),
    monto_comision: Number(row.monto_comision ?? 0),
    porcentaje_comision_preview: Number(row.porcentaje_comision_preview ?? 0),
    fecha_venta: row.venta?.fecha ?? '',
    nombre_producto: row.producto?.nombre ?? 'Producto',
    sku: row.producto?.sku ?? '',
  }))

  const pagos = (liq.pago_revendedora ?? []) as PagoRevendedoraRow[]
  const { pago_revendedora: _pagoRevendedora, ...liquidacionRow } = liq
  void _pagoRevendedora

  return {
    ok: true,
    data: {
      liquidacion: liquidacionRow as LiquidacionRevendedoraRow,
      pagos,
      lineas,
    },
  }
}
