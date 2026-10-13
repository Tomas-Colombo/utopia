/**
 * Tipos TS de reportes/dashboard/alertas (Etapa 8). Contra 00028.
 */

export interface GananciaPorProductoRow {
  id_producto: string
  nombre: string
  sku: string | null
  id_categoria: string
  categoria_nombre: string | null
  costo_vigente: number | null
  moneda: string | null
  precio_venta: number | null
  ganancia_unitaria: number | null
  margen_pct: number | null
}


export interface PerfilProveedorRow {
  id_proveedor: string
  nombre: string
  tipo: string
  telefono: string | null
  dias_rotacion: number | null
  items_disponibles: number
  consignaciones_activas: number
  monto_pendiente_rendicion: number
  lineas_pendientes_rendicion: number
  monto_rendido_historico: number
  rendiciones_pendientes_pago: number
}


export interface AlertaReposicion {
  id_producto: string
  nombre: string
  sku: string | null
  stock_minimo: number
  disponibles: number
  severidad: 'sin_stock' | 'bajo_minimo'
}

export interface AlertaRotacionVencida {
  id_item: string
  qr_code: string
  id_producto: string
  producto_nombre: string
  producto_sku: string | null
  fecha_ingreso: string
  id_proveedor: string
  proveedor_nombre: string
  dias_rotacion: number
  dias_transcurridos: number
  dias_excedidos: number
}

/**
 * STOCK de deuda al día de hoy. No lleva período a propósito: lo que te deben
 * es un saldo, no un flujo.
 */
export interface CuentasPorCobrar {
  a_cobrar: number
  vence_este_mes: number
  vencido: number
  cuotas_pendientes: number
  cuotas_vencidas: number
  clientes_con_deuda: number
  planes_activos: number
}

// ─── Alertas ────────────────────────────────────────────────────────

/** Un cliente con cuotas vencidas. Una fila por persona, no por cuota. */
export interface AlertaCuotaVencida {
  id_cliente: string
  cliente_nombre: string
  cliente_telefono: string | null
  cuotas_vencidas: number
  monto_vencido: number
  vencimiento_mas_viejo: string
  dias_vencido: number
}

// ─── Finanzas Lectura Única (Slice 9 / 00072-00073) ──────────────────

export interface FinanzasResultadosRow {
  mes: string
  ventas_brutas: number
  anulaciones: number
  ventas_netas: number
  costo_mercaderia: number
  ganancia_sobre_ventas: number
  gastos: number
  comision_liquidada: number
  comision_pendiente_estimada: number
  ganancia_final: number
  porcentaje_ganancia: number
  cantidad_ventas: number
  ticket_promedio: number
}

export interface FinanzasFlujoRow {
  mes: string
  cobrado: number
  devuelto_clientes: number
  costo_procesamiento: number
  neto_cobros: number
  compras_mercaderia: number
  pagos_proveedores: number
  gastos: number
  flujo_neto: number
  por_acreditar: Record<string, number> | null
}

export interface FinanzasSerieMensualRow {
  mes: string
  ventas_netas: number
  ganancia_sobre_ventas: number
  ganancia_final: number
  cobrado_neto: number
}

export interface FinanzasPosicion {
  capital_propio: number
  mercaderia_terceros: number
  devueltos_clientes: number
  valor_venta_potencial: number
  productos_sin_precio: number
  por_cobrar: CuentasPorCobrar | null
  deuda_proveedores: number
}

export interface FinanzasRankingRow {
  id_producto: string
  nombre: string
  unidades_vendidas: number
  monto_vendido: number
  ganancia: number
  porcentaje_ventas: number | null
}

export interface FinanzasPresupuestoRow {
  id_categoria_gasto: string
  nombre: string
  gastado: number
  presupuesto_mensual: number
  consumido_pct: number
}

export interface FinanzasContextoPeriodo {
  hoy: string
  mes_desde: string
  mes_hasta: string
}
