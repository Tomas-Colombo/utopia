import 'server-only'
import { createServerClient } from '@/lib/dal/supabase'
import type {
  AlertaCuotaVencida,
  AlertaReposicion,
  AlertaRotacionVencida,
  CuentasPorCobrar,
  GananciaPorProductoRow,
  PerfilProveedorRow,
} from '@/lib/types/reportes'

/**
 * Todos los reads llaman a vistas/funciones definidas en 00028.
 * RLS lo aplica cada query directa; las views usan security_invoker=on
 * y las funciones son STABLE con auth_tenant_id() en su body.
 */

// ─── Dashboard ───────────────────────────────────────────────────────

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

// ─── Caja y deuda (00061) ────────────────────────────────────────────

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
