import 'server-only'
import { createServerClient } from '@/lib/dal/supabase'
import type {
  AlertaCuotaVencida,
  AlertaReposicion,
  AlertaRotacionVencida,
  CuentasPorCobrar,
  DashboardKpis,
  GananciaPorProductoRow,
  IncobrablesPeriodo,
  PerfilProveedorRow,
  ReporteCaja,
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

// ─── Caja y deuda (00061) ────────────────────────────────────────────

/**
 * PERCIBIDO del período: lo que entró, medido sobre la fecha del PAGO.
 *
 * No reemplaza a `getReporteFinanciero`, que mide devengado sobre la fecha de
 * la VENTA. Desde que una venta puede cobrarse en seis meses, las dos lecturas
 * dejaron de coincidir y el panel necesita las dos.
 */
export async function getReporteCaja(input: {
  desde: string
  hasta: string
}): Promise<ReporteCaja> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('rf_reporte_caja', {
    p_desde: input.desde,
    p_hasta: input.hasta,
  })
  if (error) throw new Error(`rf_reporte_caja: ${error.message}`)
  const r = (fila(data) ?? {}) as Record<string, unknown>
  return {
    cobrado_total: Number(r.cobrado_total ?? 0),
    cobrado_contado: Number(r.cobrado_contado ?? 0),
    cobrado_cuotas: Number(r.cobrado_cuotas ?? 0),
    costo_cobro: Number(r.costo_cobro ?? 0),
    neto_acreditado: Number(r.neto_acreditado ?? 0),
    a_acreditar: Number(r.a_acreditar ?? 0),
    cantidad_pagos: Number(r.cantidad_pagos ?? 0),
  }
}

/**
 * Deuda vigente. Sin período: es un saldo, no un flujo.
 *
 * `hoy` lo pasa el caller para que el KPI y el listado de `/cuotas` no puedan
 * discrepar a caballo de la medianoche.
 */
export async function getCuentasPorCobrar(hoy: string): Promise<CuentasPorCobrar> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('rf_cuentas_por_cobrar', { p_hoy: hoy })
  if (error) throw new Error(`rf_cuentas_por_cobrar: ${error.message}`)
  const r = (fila(data) ?? {}) as Record<string, unknown>
  return {
    a_cobrar: Number(r.a_cobrar ?? 0),
    vence_este_mes: Number(r.vence_este_mes ?? 0),
    vencido: Number(r.vencido ?? 0),
    cuotas_pendientes: Number(r.cuotas_pendientes ?? 0),
    cuotas_vencidas: Number(r.cuotas_vencidas ?? 0),
    clientes_con_deuda: Number(r.clientes_con_deuda ?? 0),
    planes_activos: Number(r.planes_activos ?? 0),
  }
}

/** Pérdidas por incobrable del período, con el costo que quedó sin cubrir. */
export async function getIncobrablesPeriodo(input: {
  desde: string
  hasta: string
}): Promise<IncobrablesPeriodo> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('rf_incobrables_periodo', {
    p_desde: input.desde,
    p_hasta: input.hasta,
  })
  if (error) throw new Error(`rf_incobrables_periodo: ${error.message}`)
  const r = (fila(data) ?? {}) as Record<string, unknown>
  return {
    monto_incobrable: Number(r.monto_incobrable ?? 0),
    costo_no_cubierto: Number(r.costo_no_cubierto ?? 0),
    cuotas_incobrables: Number(r.cuotas_incobrables ?? 0),
    ventas_afectadas: Number(r.ventas_afectadas ?? 0),
    clientes_afectados: Number(r.clientes_afectados ?? 0),
  }
}

/** Clientes con cuotas vencidas, el que más debe primero. */
export async function listAlertasCuotasVencidas(
  hoy: string,
  limite = 20,
): Promise<AlertaCuotaVencida[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('rf_alertas_cuotas_vencidas', {
    p_hoy: hoy,
    p_limite: limite,
  })
  if (error) throw new Error(`rf_alertas_cuotas_vencidas: ${error.message}`)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id_cliente: String(r.id_cliente),
    cliente_nombre: String(r.cliente_nombre ?? ''),
    cliente_telefono: (r.cliente_telefono as string | null) ?? null,
    cuotas_vencidas: Number(r.cuotas_vencidas ?? 0),
    monto_vencido: Number(r.monto_vencido ?? 0),
    vencimiento_mas_viejo: String(r.vencimiento_mas_viejo),
    dias_vencido: Number(r.dias_vencido ?? 0),
  }))
}

/** Las `rf_*` que devuelven `table(...)` de una sola fila llegan como array. */
function fila(data: unknown): unknown {
  return Array.isArray(data) ? data[0] : data
}
