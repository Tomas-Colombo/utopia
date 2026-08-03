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
  /** Sólo relevante en descuentos. Flag informativo: no fuerza exclusividad. */
  acumulable: boolean
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
  acumulable?: boolean
  fecha_inicio?: string | null
  fecha_hasta?: string | null
}

/**
 * Un descuento aplicable a un producto del carrito, tal como lo devuelve
 * `sp_descuentos_disponibles_venta`. La UI agrupa por alcance: 'producto'
 * se ofrece en la fila; global/categoría/proveedor en el panel lateral.
 */
export interface DescuentoDisponible {
  id_producto: string
  id_regla: string
  nombre: string
  alcance: AlcanceRegla
  tipo_valor: TipoValorRegla
  valor: number
  acumulable: boolean
}

/**
 * Respuesta de `sp_calcular_precio_venta_snapshot`. La UI y la venta
 * consumen esto.
 */
export type SnapshotPrecio =
  | {
      ok: true
      precio_lista: number
      precio_final: number
      forma_pago: FormaPago
      desactualizado: boolean
      desglose: DesgloseVenta
    }
  | {
      ok: false
      reason: 'sin-precio-lista'
      requiere_recalcular: true
    }

/** Un descuento efectivamente aplicado a la línea, con su impacto en $. */
export interface DescuentoAplicado {
  id_regla: string
  nombre: string
  alcance: AlcanceRegla
  tipo_valor: TipoValorRegla
  valor: number
  acumulable: boolean
  /** Cuánto restó del precio de lista (en $, ya redondeado). */
  monto: number
}

/** El recargo por forma de pago aplicado, si hubo. */
export interface RecargoAplicado {
  id_regla: string
  tipo_valor: TipoValorRegla
  valor: number
  forma_pago: FormaPago
  monto: number
}

/** Desglose de reglas que devuelve el snapshot y se persiste en la venta. */
export interface DesgloseVenta {
  descuentos: DescuentoAplicado[]
  recargo_forma_pago?: RecargoAplicado
}

/**
 * Contadores del home de Precios. Se resuelven con una agregación
 * (`sp_precios_resumen`) en vez de traer el catálogo entero.
 */
export interface PreciosResumen {
  productosActivos: number
  desactualizados: number
  sinPrecio: number
  conRegla: number
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
