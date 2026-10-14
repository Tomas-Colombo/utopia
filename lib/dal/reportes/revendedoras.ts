import 'server-only'
import { createServerClient } from '@/lib/dal/supabase'
import type {
  PerfilRevendedoraRow,
  CumplimientoObjetivosRow,
  ResumenCanalRow,
} from '@/lib/types/reportes'

export async function getPerfilRevendedoras(
  desde: string,
  hasta: string,
  idRevendedora?: string,
  limit = 50,
  offset = 0
): Promise<PerfilRevendedoraRow[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('rf_perfil_revendedora', {
    p_desde: desde,
    p_hasta: hasta,
    p_id_revendedora: idRevendedora ?? null,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw new Error(`rf_perfil_revendedora: ${error.message}`)

  const rows = (data as Record<string, unknown>[]) ?? []
  return rows.map((row) => ({
    id_revendedora: String(row.id_revendedora ?? ''),
    nombre: String(row.nombre ?? ''),
    apellido: String(row.apellido ?? ''),
    telefono: row.telefono != null ? String(row.telefono) : null,
    email: row.email != null ? String(row.email) : null,
    estado: String(row.estado ?? 'activa'),
    piezas_en_poder: Number(row.piezas_en_poder ?? 0),
    valor_en_poder: Number(row.valor_en_poder ?? 0),
    total_vendido: Number(row.total_vendido ?? 0),
    comision_liquidada: Number(row.comision_liquidada ?? 0),
    comision_estimada: Number(row.comision_estimada ?? 0),
    adeudado: Number(row.adeudado ?? 0),
    cantidad_ventas: Number(row.cantidad_ventas ?? 0),
    ticket_promedio: Number(row.ticket_promedio ?? 0),
    piezas_entregadas_historico: Number(row.piezas_entregadas_historico ?? 0),
    rotacion_pct: Number(row.rotacion_pct ?? 0),
  }))
}

export async function getCumplimientoObjetivos(
  desde: string,
  hasta: string,
  idRevendedora?: string
): Promise<CumplimientoObjetivosRow[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('rf_cumplimiento_objetivos', {
    p_desde: desde,
    p_hasta: hasta,
    p_id_revendedora: idRevendedora ?? null,
  })
  if (error) throw new Error(`rf_cumplimiento_objetivos: ${error.message}`)

  const rows = (data as Record<string, unknown>[]) ?? []
  return rows.map((row) => ({
    id_revendedora: String(row.id_revendedora ?? ''),
    nombre: String(row.nombre ?? ''),
    apellido: String(row.apellido ?? ''),
    vendido_periodo: Number(row.vendido_periodo ?? 0),
    id_regla: row.id_regla != null ? String(row.id_regla) : null,
    tramo_actual_desde: Number(row.tramo_actual_desde ?? 0),
    porcentaje_actual: Number(row.porcentaje_actual ?? 0),
    proximo_tramo_desde: row.proximo_tramo_desde != null ? Number(row.proximo_tramo_desde) : null,
    proximo_porcentaje: row.proximo_porcentaje != null ? Number(row.proximo_porcentaje) : null,
    falta_para_proximo: row.falta_para_proximo != null ? Number(row.falta_para_proximo) : null,
  }))
}

export async function getResumenCanal(
  desde: string,
  hasta: string
): Promise<ResumenCanalRow | null> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('rf_resumen_canal', {
    p_desde: desde,
    p_hasta: hasta,
  })
  if (error) throw new Error(`rf_resumen_canal: ${error.message}`)

  const rows = (data as Record<string, unknown>[]) ?? []
  if (!rows.length) return null
  const row = rows[0]

  return {
    ventas_local_monto: Number(row.ventas_local_monto ?? 0),
    ventas_local_cant: Number(row.ventas_local_cant ?? 0),
    ventas_revendedora_monto: Number(row.ventas_revendedora_monto ?? 0),
    ventas_revendedora_cant: Number(row.ventas_revendedora_cant ?? 0),
    comision_revendedora_monto: Number(row.comision_revendedora_monto ?? 0),
    stock_central_cant: Number(row.stock_central_cant ?? 0),
    stock_central_valor: Number(row.stock_central_valor ?? 0),
    stock_revendedoras_cant: Number(row.stock_revendedoras_cant ?? 0),
    stock_revendedoras_valor: Number(row.stock_revendedoras_valor ?? 0),
  }
}
