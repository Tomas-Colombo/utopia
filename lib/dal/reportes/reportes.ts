import 'server-only'
import { createServerClient } from '@/lib/dal/supabase'
import type {
  AlertaReposicion,
  AlertaRotacionVencida,
  DashboardKpis,
  GananciaPorProductoRow,
  PerfilProveedorRow,
  ReporteFinanciero,
  RotacionRow,
} from '@/lib/types/reportes'

/**
 * Todos los reads llaman a vistas/funciones definidas en 00028.
 * RLS lo aplica cada query directa; las views usan security_invoker=on
 * y las funciones son STABLE con auth_tenant_id() en su body.
 */

// ─── Dashboard ───────────────────────────────────────────────────────

export async function getDashboardKpis(): Promise<DashboardKpis> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('rf_dashboard_kpis')
  if (error) throw new Error(`rf_dashboard_kpis: ${error.message}`)
  // La función devuelve setof (una sola row). Supabase JS lo entrega como array.
  const row = Array.isArray(data) ? data[0] : data
  const r = (row ?? {}) as Record<string, unknown>
  return {
    ventas_hoy: Number(r.ventas_hoy ?? 0),
    facturado_hoy: Number(r.facturado_hoy ?? 0),
    ventas_30d: Number(r.ventas_30d ?? 0),
    facturado_30d: Number(r.facturado_30d ?? 0),
    rendiciones_pendientes: Number(r.rendiciones_pendientes ?? 0),
    monto_rendiciones_pendientes: Number(r.monto_rendiciones_pendientes ?? 0),
    reservas_activas: Number(r.reservas_activas ?? 0),
    reservas_vencidas_sin_purgar: Number(r.reservas_vencidas_sin_purgar ?? 0),
    productos_bajo_minimo: Number(r.productos_bajo_minimo ?? 0),
    items_rotacion_vencida: Number(r.items_rotacion_vencida ?? 0),
  }
}

// ─── Alertas ────────────────────────────────────────────────────────

export async function listAlertaReposicion(): Promise<AlertaReposicion[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('v_alerta_reposicion')
    .select('id_producto, nombre, sku, stock_minimo, disponibles, severidad')
    .order('severidad', { ascending: true }) // 'sin_stock' antes que 'bajo_minimo'
    .order('disponibles', { ascending: true })
  if (error) throw new Error(`v_alerta_reposicion: ${error.message}`)
  return ((data ?? []) as Array<{
    id_producto: string
    nombre: string
    sku: string | null
    stock_minimo: number
    disponibles: number | string
    severidad: 'sin_stock' | 'bajo_minimo'
  }>).map((r) => ({
    id_producto: r.id_producto,
    nombre: r.nombre,
    sku: r.sku,
    stock_minimo: Number(r.stock_minimo),
    disponibles: Number(r.disponibles),
    severidad: r.severidad,
  }))
}

export async function listAlertaRotacionVencida(): Promise<AlertaRotacionVencida[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('v_alerta_rotacion_vencida')
    .select('id_item, qr_code, id_producto, producto_nombre, producto_sku, fecha_ingreso, id_proveedor, proveedor_nombre, dias_rotacion, dias_transcurridos, dias_excedidos')
    .order('dias_excedidos', { ascending: false })
  if (error) throw new Error(`v_alerta_rotacion_vencida: ${error.message}`)
  return ((data ?? []) as Array<{
    id_item: string
    qr_code: string
    id_producto: string
    producto_nombre: string
    producto_sku: string | null
    fecha_ingreso: string
    id_proveedor: string
    proveedor_nombre: string
    dias_rotacion: number | string
    dias_transcurridos: number | string
    dias_excedidos: number | string
  }>).map((r) => ({
    ...r,
    dias_rotacion: Number(r.dias_rotacion),
    dias_transcurridos: Number(r.dias_transcurridos),
    dias_excedidos: Number(r.dias_excedidos),
  }))
}

// ─── Reportes ────────────────────────────────────────────────────────

export async function listGananciaPorProducto(): Promise<GananciaPorProductoRow[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('v_ganancia_por_producto')
    .select('*')
    .order('margen_pct', { ascending: false, nullsFirst: false })
  if (error) throw new Error(`v_ganancia_por_producto: ${error.message}`)
  return ((data ?? []) as GananciaPorProductoRow[]).map((r) => ({
    ...r,
    costo_vigente: r.costo_vigente == null ? null : Number(r.costo_vigente),
    precio_venta: r.precio_venta == null ? null : Number(r.precio_venta),
    ganancia_unitaria: r.ganancia_unitaria == null ? null : Number(r.ganancia_unitaria),
    margen_pct: r.margen_pct == null ? null : Number(r.margen_pct),
  }))
}

export async function getRotacion(input: {
  desde: string
  hasta: string
  idCategoria?: string | null
}): Promise<RotacionRow[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('rf_rotacion_por_producto', {
    p_desde: input.desde,
    p_hasta: input.hasta,
    p_id_categoria: input.idCategoria ?? null,
  })
  if (error) throw new Error(`rf_rotacion_por_producto: ${error.message}`)
  return ((data ?? []) as RotacionRow[]).map((r) => ({
    ...r,
    unidades_vendidas: Number(r.unidades_vendidas),
    monto_vendido: Number(r.monto_vendido),
    monto_ganancia: Number(r.monto_ganancia),
    ticket_promedio: Number(r.ticket_promedio),
  }))
}

export async function listPerfilProveedor(): Promise<PerfilProveedorRow[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('v_perfil_proveedor')
    .select('*')
    .order('monto_pendiente_rendicion', { ascending: false })
  if (error) throw new Error(`v_perfil_proveedor: ${error.message}`)
  return ((data ?? []) as PerfilProveedorRow[]).map((r) => ({
    ...r,
    items_disponibles: Number(r.items_disponibles),
    consignaciones_activas: Number(r.consignaciones_activas),
    monto_pendiente_rendicion: Number(r.monto_pendiente_rendicion),
    lineas_pendientes_rendicion: Number(r.lineas_pendientes_rendicion),
    monto_rendido_historico: Number(r.monto_rendido_historico),
    rendiciones_pendientes_pago: Number(r.rendiciones_pendientes_pago),
  }))
}

export async function getReporteFinanciero(input: {
  desde: string
  hasta: string
}): Promise<ReporteFinanciero> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('rf_reporte_financiero', {
    p_desde: input.desde,
    p_hasta: input.hasta,
  })
  if (error) throw new Error(`rf_reporte_financiero: ${error.message}`)
  const row = Array.isArray(data) ? data[0] : data
  const r = (row ?? {}) as Record<string, unknown>
  return {
    ingresos_totales: Number(r.ingresos_totales ?? 0),
    costo_mercaderia: Number(r.costo_mercaderia ?? 0),
    monto_a_proveedores: Number(r.monto_a_proveedores ?? 0),
    ganancia_bruta_real: Number(r.ganancia_bruta_real ?? 0),
    ganancia_bruta_esperada: Number(r.ganancia_bruta_esperada ?? 0),
    impacto_descuentos: Number(r.impacto_descuentos ?? 0),
    gastos_totales: Number(r.gastos_totales ?? 0),
    ganancia_neta: Number(r.ganancia_neta ?? 0),
    cantidad_ventas: Number(r.cantidad_ventas ?? 0),
    cantidad_lineas: Number(r.cantidad_lineas ?? 0),
    ticket_promedio: Number(r.ticket_promedio ?? 0),
  }
}
