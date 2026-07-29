/**
 * Tipos TS para el motor de precios (Etapa 4).
 * Mantenidos a mano contra 00017-00019.
 */

export type TipoRegla = 'margen' | 'descuento' | 'recargo'
export type TipoValorRegla = 'porcentaje' | 'monto_fijo'
export type AlcanceRegla = 'global' | 'categoria' | 'proveedor' | 'producto'
export type FormaPago = 'efectivo' | 'cuotas_2' | 'cuotas_3'

export const FORMA_PAGO_LABEL: Record<FormaPago, string> = {
  efectivo: 'Efectivo',
  cuotas_2: '2 cuotas',
  cuotas_3: '3 cuotas',
}

export const TIPO_REGLA_LABEL: Record<TipoRegla, string> = {
  margen: 'Margen',
  descuento: 'Descuento',
  recargo: 'Recargo',
}

export const ALCANCE_LABEL: Record<AlcanceRegla, string> = {
  global: 'Global',
  categoria: 'Categoría',
  proveedor: 'Proveedor',
  producto: 'Producto',
}

export interface ReglaPrecioRow {
  id_regla: string
  id_tenant: string
  nombre: string
  tipo_regla: TipoRegla
  tipo_valor: TipoValorRegla
  valor: number
  alcance: AlcanceRegla
  id_producto: string | null
  id_categoria: string | null
  id_proveedor: string | null
  forma_pago: FormaPago | null
  prioridad: number
  fecha_inicio: string | null
  fecha_hasta: string | null
  fecha_baja: string | null
  created_at: string
  updated_at: string
}

export interface ReglaPrecioInsert {
  nombre: string
  tipo_regla: TipoRegla
  tipo_valor: TipoValorRegla
  valor: number
  alcance: AlcanceRegla
  id_producto?: string | null
  id_categoria?: string | null
  id_proveedor?: string | null
  forma_pago?: FormaPago | null
  prioridad?: number
  fecha_inicio?: string | null
  fecha_hasta?: string | null
}

/**
 * Respuesta de `sp_calcular_precio_venta_snapshot`. La UI y la venta
 * (Etapa 5) consumen esto.
 */
export type SnapshotPrecio =
  | {
      ok: true
      precio_lista: number
      precio_final: number
      forma_pago: FormaPago
      desactualizado: boolean
      desglose: Record<string, DesgloseItem>
    }
  | {
      ok: false
      reason: 'sin-precio-lista'
      requiere_recalcular: true
    }

export interface DesgloseItem {
  id_regla: string
  tipo_valor: TipoValorRegla
  valor: number
  nombre?: string
  forma_pago?: FormaPago
}

/**
 * Estado del producto respecto a su precio (Control de precios).
 */
export interface ProductoConPrecioStatus {
  id_producto: string
  nombre: string
  sku: string | null
  categoria_nombre: string | null
  costo_vigente: number | null
  precio_venta: number | null
  precio_venta_resuelto_at: string | null
  precio_venta_desactualizado: boolean
  regla_margen_nombre: string | null
  /** Precio proyectado si se recalcula ahora (útil para preview). */
  precio_proyectado: number | null
  /** Diferencia % vs precio actual. Null si no hay precio actual. */
  diferencia_pct: number | null
}
