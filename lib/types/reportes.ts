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

export interface RotacionRow {
  id_producto: string
  nombre: string
  sku: string | null
  categoria_nombre: string | null
  unidades_vendidas: number
  monto_vendido: number
  monto_ganancia: number
  ticket_promedio: number
  primera_venta: string | null
  ultima_venta: string | null
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

export interface ReporteFinanciero {
  ingresos_totales: number
  costo_mercaderia: number
  monto_a_proveedores: number
  ganancia_bruta_real: number
  ganancia_bruta_esperada: number
  impacto_descuentos: number
  gastos_totales: number
  ganancia_neta: number
  cantidad_ventas: number
  cantidad_lineas: number
  ticket_promedio: number
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

export interface DashboardKpis {
  ventas_hoy: number
  facturado_hoy: number
  ventas_30d: number
  facturado_30d: number
  rendiciones_pendientes: number
  monto_rendiciones_pendientes: number
  reservas_activas: number
  reservas_vencidas_sin_purgar: number
  productos_bajo_minimo: number
  items_rotacion_vencida: number
}

// ─── Caja y deuda (00061) ────────────────────────────────────────────

/**
 * PERCIBIDO: lo que entró en el período, medido sobre la fecha del pago y no
 * la de la venta. Complementa a `ReporteFinanciero`, que es devengado — no lo
 * reemplaza: sólo con caja no se sabe si el negocio vende bien, y sólo con
 * devengado no se sabe si hay plata.
 */
export interface ReporteCaja {
  cobrado_total: number
  /** Cobros del día de la venta: contado o anticipo. */
  cobrado_contado: number
  /** Cobros de cuotas financiadas por la casa. */
  cobrado_cuotas: number
  /** Lo que retuvo el procesador (00057). */
  costo_cobro: number
  neto_acreditado: number
  /** Neto ya cobrado que todavía no está en la cuenta: tarjeta con plazo. */
  a_acreditar: number
  cantidad_pagos: number
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

/**
 * FLUJO de pérdidas del período.
 *
 * `monto_incobrable` ya tiene su asiento de gasto y cierra contra el ingreso
 * devengado. `costo_no_cubierto` NO tiene asiento y no debe tenerlo: el costo
 * ya está en `costo_mercaderia` del devengado. Es la plata que hay que poner
 * del bolsillo, porque al proveedor se le paga igual.
 */
export interface IncobrablesPeriodo {
  monto_incobrable: number
  costo_no_cubierto: number
  cuotas_incobrables: number
  ventas_afectadas: number
  clientes_afectados: number
}

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
