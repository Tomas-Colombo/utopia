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
