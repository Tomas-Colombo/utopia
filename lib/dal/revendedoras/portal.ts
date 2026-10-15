import 'server-only'
import { createServerClient } from '@/lib/dal/supabase'
import type { Session } from '@/lib/dal/session'
import { requireModuleRole } from '@/lib/dal/guard'
import type {
  DeclararVentaRevendedoraPayload,
  RetirarDeclaracionPayload,
} from '@/lib/validation/revendedoras'
import type {
  RvpMiCuentaRow,
  RvpMiStockRow,
  RvpMisVentasRow,
  RvpMisLiquidacionesRow,
  RvpMisDeclaracionesRow,
} from '@/lib/types/revendedoras'

function extractErrorSlug(error: { code?: string; message?: string }): string {
  const msg = error.message || ''
  const code = error.code || ''

  if (code === '42501' || msg.includes('no-permission')) return 'no-permission'
  if (msg.includes('modulo-revendedoras-deshabilitado')) return 'modulo-revendedoras-deshabilitado'
  if (msg.includes('no-revendedora')) return 'no-revendedora'
  if (msg.includes('item-no-en-poder')) return 'item-no-en-poder'
  if (msg.includes('declaracion-duplicada')) return 'declaracion-duplicada'
  if (msg.includes('declaracion-no-encontrada')) return 'declaracion-no-encontrada'
  if (msg.includes('declaracion-no-pendiente')) return 'declaracion-no-pendiente'
  if (msg.includes('item-not-found')) return 'item-not-found'
  if (msg.includes('item-invalido')) return 'item-invalido'
  if (msg.includes('item-no-disponible')) return 'item-no-disponible'

  const cleaned = msg.replace(/^.*(?:sp|rvp|rf)_[a-zA-Z0-9_]+:\s*/, '').trim()
  const candidate = cleaned.split(':')[0]?.trim().toLowerCase() || ''

  if (candidate && /^[a-z0-9-]+$/.test(candidate)) {
    return candidate
  }

  return 'error-desconocido'
}

export async function obtenerMiCuenta(
  session: Session,
): Promise<{ ok: true; data: RvpMiCuentaRow } | { ok: false; reason: string }> {
  await requireModuleRole(session, 'revendedoras', 'ver_propio')
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('rvp_mi_cuenta')

  if (error) {
    return { ok: false, reason: extractErrorSlug(error) }
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row) {
    return {
      ok: true,
      data: {
        piezas_en_poder: 0,
        valor_en_poder: 0,
        total_vendido: 0,
        comision_liquidada: 0,
        comision_estimada: 0,
        total_adeudado: 0,
        total_pagado: 0,
        declaraciones_pendientes: 0,
        porcentaje_comision_actual: 0,
        tramo_comision_actual: 'Sin ventas',
      },
    }
  }

  return {
    ok: true,
    data: {
      piezas_en_poder: Number(row.piezas_en_poder ?? 0),
      valor_en_poder: Number(row.monto_en_poder ?? 0),
      total_vendido: Number(row.total_vendido ?? 0),
      comision_liquidada: Number(row.comision_liquidada ?? 0),
      comision_estimada: Number(row.comision_estimada ?? 0),
      total_adeudado: Number(row.total_adeudado ?? 0),
      total_pagado: Number(row.total_pagado ?? 0),
      declaraciones_pendientes: Number(row.declaraciones_pendientes ?? 0),
      porcentaje_comision_actual: Number(row.porcentaje_comision_actual ?? 0),
      tramo_comision_actual: '',
    },
  }
}

export async function listarMiStock(
  session: Session,
  params?: { limit?: number; offset?: number },
): Promise<{ ok: true; data: RvpMiStockRow[] } | { ok: false; reason: string }> {
  await requireModuleRole(session, 'revendedoras', 'ver_propio')
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('rvp_mi_stock', {
    p_limit: params?.limit ?? 50,
    p_offset: params?.offset ?? 0,
  })

  if (error) {
    return { ok: false, reason: extractErrorSlug(error) }
  }

  return {
    ok: true,
    data: ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      id_item: String(r.id_item),
      id_producto: String(r.id_producto),
      nombre_producto: String(r.descripcion ?? ''),
      sku: String(r.sku ?? ''),
      talle: r.talle ? String(r.talle) : null,
      precio_venta: Number(r.precio_venta ?? 0),
      fecha_entrega: String(r.fecha_consignacion),
      declaracion_pendiente: Boolean(r.declarado_pendiente),
    })),
  }
}

export async function listarMisVentas(
  session: Session,
  params?: { limit?: number; offset?: number },
): Promise<{ ok: true; data: RvpMisVentasRow[] } | { ok: false; reason: string }> {
  await requireModuleRole(session, 'revendedoras', 'ver_propio')
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('rvp_mis_ventas', {
    p_limit: params?.limit ?? 50,
    p_offset: params?.offset ?? 0,
  })

  if (error) {
    return { ok: false, reason: extractErrorSlug(error) }
  }

  return {
    ok: true,
    data: ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      id_venta: String(r.id_venta),
      fecha_venta: String(r.fecha_venta),
      total_venta: Number(r.monto_vendido ?? r.precio_venta ?? 0),
      cantidad_piezas: 1,
      comision_total: Number(r.comision_liquidada ?? 0) + Number(r.comision_estimada ?? 0),
      liquidada: r.estado_liquidacion === 'liquidada',
      id_liquidacion: null,
    })),
  }
}

export async function listarMisLiquidaciones(
  session: Session,
  params?: { limit?: number; offset?: number },
): Promise<{ ok: true; data: RvpMisLiquidacionesRow[] } | { ok: false; reason: string }> {
  await requireModuleRole(session, 'revendedoras', 'ver_propio')
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('rvp_mis_liquidaciones', {
    p_limit: params?.limit ?? 50,
    p_offset: params?.offset ?? 0,
  })

  if (error) {
    return { ok: false, reason: extractErrorSlug(error) }
  }

  return {
    ok: true,
    data: ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      id_liquidacion: String(r.id_liquidacion),
      fecha_liquidacion: String(r.fecha_liquidacion),
      periodo_desde: String(r.periodo_desde),
      periodo_hasta: String(r.periodo_hasta),
      total_venta: Number(r.monto_vendido ?? r.precio_venta ?? 0),
      monto_comision: Number(r.monto_comision ?? 0),
      monto_a_cobrar: Number(r.monto_a_cobrar ?? 0),
      estado: r.estado as 'pendiente' | 'pagada',
      total_pagado: Number(r.monto_pagado ?? 0),
    })),
  }
}

export async function listarMisDeclaraciones(
  session: Session,
  params?: { limit?: number; offset?: number },
): Promise<{ ok: true; data: RvpMisDeclaracionesRow[] } | { ok: false; reason: string }> {
  await requireModuleRole(session, 'revendedoras', 'ver_propio')
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('rvp_mis_declaraciones', {
    p_limit: params?.limit ?? 50,
    p_offset: params?.offset ?? 0,
  })

  if (error) {
    return { ok: false, reason: extractErrorSlug(error) }
  }

  return {
    ok: true,
    data: ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      id_declaracion: String(r.id_declaracion),
      id_item: String(r.id_item),
      fecha: String(r.fecha),
      nota: r.nota ? String(r.nota) : null,
      estado: r.estado as 'pendiente' | 'confirmada' | 'rechazada' | 'retirada',
      motivo_rechazo: r.motivo_rechazo ? String(r.motivo_rechazo) : null,
      nombre_producto: String(r.descripcion ?? ''),
      sku: String(r.sku ?? ''),
      talle: r.talle ? String(r.talle) : null,
      precio_venta: Number(r.precio_venta ?? 0),
    })),
  }
}

export async function declararVentaRevendedora(
  session: Session,
  payload: DeclararVentaRevendedoraPayload,
): Promise<{ ok: true; data: string } | { ok: false; reason: string }> {
  await requireModuleRole(session, 'revendedoras', 'declarar')
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('sp_declarar_venta_revendedora', {
    p_id_item: payload.id_item,
    p_nota: payload.nota ?? '',
  })

  if (error) {
    return { ok: false, reason: extractErrorSlug(error) }
  }

  return { ok: true, data: data as string }
}

export async function retirarDeclaracion(
  session: Session,
  payload: RetirarDeclaracionPayload,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  await requireModuleRole(session, 'revendedoras', 'declarar')
  const supabase = await createServerClient()
  const { error } = await supabase.rpc('sp_retirar_declaracion', {
    p_id_declaracion: payload.id_declaracion,
  })

  if (error) {
    return { ok: false, reason: extractErrorSlug(error) }
  }

  return { ok: true }
}
