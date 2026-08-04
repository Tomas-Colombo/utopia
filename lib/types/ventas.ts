/**
 * Tipos TS mantenidos a mano contra 00020-00023 y 00047.
 */

import type { DesgloseVenta, FormaPago } from './precios'
import type { TipoIngreso } from './inventario'

export type EstadoVenta = 'registrada' | 'anulada'
/**
 * Por dónde ENTRÓ la plata. Distinto de `FormaPago`, que es cómo se PRECIÓ la
 * venta (esa define el recargo por regla; ésta no toca el precio).
 */
export type MedioPago = 'efectivo' | 'transferencia' | 'tarjeta_debito' | 'tarjeta_credito'
export type TipoCuentaDestino = 'efectivo' | 'banco' | 'billetera_virtual'
export type EstadoReserva = 'activa' | 'cancelada' | 'vencida' | 'convertida_venta'
export type TipoComprobante = 'factura_a' | 'factura_b' | 'factura_c' | 'remito' | 'ticket'

export const ESTADO_VENTA_LABEL: Record<EstadoVenta, string> = {
  registrada: 'Registrada',
  anulada: 'Anulada',
}
export const ESTADO_RESERVA_LABEL: Record<EstadoReserva, string> = {
  activa: 'Activa',
  cancelada: 'Cancelada',
  vencida: 'Vencida',
  convertida_venta: 'Convertida en venta',
}
export const MEDIO_PAGO_LABEL: Record<MedioPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta_debito: 'Tarjeta de débito',
  tarjeta_credito: 'Tarjeta de crédito',
}
export const TIPO_CUENTA_DESTINO_LABEL: Record<TipoCuentaDestino, string> = {
  efectivo: 'Efectivo',
  banco: 'Cuenta bancaria',
  billetera_virtual: 'Billetera virtual',
}
export const TIPO_COMPROBANTE_LABEL: Record<TipoComprobante, string> = {
  factura_a: 'Factura A',
  factura_b: 'Factura B',
  factura_c: 'Factura C',
  remito: 'Remito',
  ticket: 'Ticket',
}

// ─── Cliente ─────────────────────────────────────────────────────────

export interface ClienteRow {
  id_cliente: string
  id_tenant: string
  nombre: string
  telefono: string | null
  email: string | null
  notas: string | null
  activo: boolean
  created_at: string
  updated_at: string
}

export interface ClienteInsert {
  id_tenant: string
  nombre: string
  telefono?: string | null
  email?: string | null
  notas?: string | null
  activo?: boolean
}

// ─── Venta ───────────────────────────────────────────────────────────

export interface VentaRow {
  id_venta: string
  id_tenant: string
  id_cliente: string | null
  id_usuario_alta: string | null
  fecha: string
  forma_pago: FormaPago
  total: number
  observaciones: string | null
  estado_venta: EstadoVenta
  fecha_anulacion: string | null
  motivo_anulacion: string | null
  created_at: string
  updated_at: string
}

export interface DetalleVentaRow {
  id_detalle_venta: string
  id_tenant: string
  id_venta: string
  id_item: string
  id_producto: string
  id_proveedor: string | null
  precio_venta: number
  costo_snapshot: number
  monto_proveedor: number
  monto_gasto: number
  monto_ganancia: number
  tipo_ingreso_snapshot: TipoIngreso
  desglose_reglas: DesgloseVenta
  id_rendicion: string | null
  excluida_rendicion: boolean
  created_at: string
}

export interface VentaConDetalle extends VentaRow {
  cliente: Pick<ClienteRow, 'id_cliente' | 'nombre' | 'telefono'> | null
  lineas: Array<
    DetalleVentaRow & {
      producto: { id_producto: string; nombre: string; sku: string | null } | null
      item: { qr_code: string } | null
    }
  >
  comprobantes: ComprobanteRow[]
  pagos: Array<PagoVentaRow & { cuenta: Pick<CuentaDestinoRow, 'id_cuenta_destino' | 'nombre' | 'tipo'> | null }>
}

// ─── Cobranza (00047) ────────────────────────────────────────────────

export interface CuentaDestinoRow {
  id_cuenta_destino: string
  id_tenant: string
  nombre: string
  tipo: TipoCuentaDestino
  titular: string | null
  identificador: string | null
  activo: boolean
  es_predeterminada: boolean
  created_at: string
  updated_at: string
}

export interface PagoVentaRow {
  id_pago_venta: string
  id_tenant: string
  id_venta: string
  id_cuenta_destino: string
  medio: MedioPago
  monto: number
  /** Sólo efectivo: lo que el cliente entregó. */
  monto_recibido: number | null
  /** Columna generada por la DB (`monto_recibido - monto`). */
  vuelto: number | null
  referencia: string | null
  created_at: string
}

/** Un pago tal como lo arma la UI para sp_registrar_venta. */
export interface PagoInput {
  medio: MedioPago
  id_cuenta_destino: string
  monto: number
  monto_recibido?: number | null
  referencia?: string | null
}

export interface ComprobanteRow {
  id_comprobante: string
  id_tenant: string
  id_venta: string
  tipo: TipoComprobante
  numero: string
  fecha_emision: string
  created_at: string
}

/** Payload que la UI arma para sp_registrar_venta. */
export interface RegistrarVentaInput {
  /** `descuentos`: ids de reglas de descuento elegidas para esa línea. */
  lineas: Array<{ id_item: string; descuentos?: string[] }>
  forma_pago: FormaPago
  id_cliente?: string | null
  id_reserva?: string | null
  observaciones?: string | null
  /**
   * Cobranza. Vacío/omitido = el SP arma un solo pago por el total contra la
   * cuenta predeterminada. Si viene, la suma DEBE dar el total de la venta.
   */
  pagos?: PagoInput[]
}

// ─── Reserva ─────────────────────────────────────────────────────────

export interface ReservaRow {
  id_reserva: string
  id_tenant: string
  id_cliente: string | null
  id_usuario_alta: string | null
  fecha: string
  fecha_vencimiento: string
  estado_reserva: EstadoReserva
  fecha_cierre: string | null
  observaciones: string | null
  created_at: string
  updated_at: string
}

export interface DetalleReservaRow {
  id_detalle_reserva: string
  id_tenant: string
  id_reserva: string
  id_item: string
  id_producto: string
  precio_snapshot: number
  estado: EstadoReserva
  created_at: string
}

export interface ReservaConDetalle extends ReservaRow {
  cliente: Pick<ClienteRow, 'id_cliente' | 'nombre' | 'telefono'> | null
  lineas: Array<
    DetalleReservaRow & {
      producto: { id_producto: string; nombre: string; sku: string | null } | null
      item: { qr_code: string; estado_item: string } | null
    }
  >
}

/**
 * Una reserva activa que está bloqueando unidades de un producto concreto.
 * El carrito de venta la usa para dos cosas: marcar el producto como
 * reservado en el buscador, y saber a qué reserva engancharse si el vendedor
 * lo carga igual.
 */
export interface ReservaDeProducto {
  id_reserva: string
  cliente_nombre: string | null
  fecha_vencimiento: string
  /** Unidades de ESE producto bloqueadas por ESTA reserva. */
  unidades: number
}

// ─── Vista carrito (UI-only) ────────────────────────────────────────

export interface LineaCarrito {
  id_item: string
  /** Necesario para poder repedir otra unidad del mismo producto (cambio de talle). */
  id_producto: string
  qr_code: string
  /** Talle de la unidad concreta; null = producto sin talle. */
  talle: string | null
  producto_nombre: string
  sku: string | null
  categoria_nombre: string | null
  precio_lista: number | null
  precio_final: number | null
  desactualizado: boolean
  desglose: DesgloseVenta
  advertencia: string | null // e.g. "reservado por otro cliente"
}
