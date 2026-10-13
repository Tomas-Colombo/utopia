export interface RevendedoraRow {
  id_revendedora: string
  id_tenant: string
  id_usuario: string | null
  nombre: string
  apellido: string
  telefono: string | null
  email: string | null
  notas: string | null
  fecha_alta: string
  activo: boolean
  created_at: string
  updated_at: string
}

export type EstadoConsignacionRevendedora = 'abierta' | 'cerrada'

export type EstadoConsignacionRevendedoraDetalle =
  | 'pendiente'
  | 'en_poder'
  | 'vendido'
  | 'devuelto'
  | 'baja'

export interface ConsignacionRevendedoraRow {
  id_consignacion_revendedora: string
  id_tenant: string
  id_revendedora: string
  id_usuario_alta: string | null
  periodo_desde: string | null
  periodo_hasta: string | null
  estado: EstadoConsignacionRevendedora
  confirmada: boolean
  fecha_confirmacion: string | null
  fecha_cierre: string | null
  observaciones: string | null
  created_at: string
  updated_at: string
}

export interface ConsignacionRevendedoraDetalleRow {
  id_consignacion_revendedora_detalle: string
  id_tenant: string
  id_consignacion_revendedora: string
  id_item: string
  id_producto: string
  estado_detalle: EstadoConsignacionRevendedoraDetalle
  fecha_entrega: string | null
  fecha_devolucion: string | null
  motivo: string | null
  created_at: string
}

export interface ConsignacionRevendedoraItemDetalle {
  id_consignacion_revendedora_detalle: string
  id_item: string
  id_producto: string
  codigo_barra: string | null
  sku: string
  nombre_producto: string
  talle: string | null
  precio_actual: number
  estado_detalle: EstadoConsignacionRevendedoraDetalle
  fecha_entrega: string | null
  fecha_devolucion: string | null
  motivo: string | null
  created_at: string
}

export interface ConsignacionRevendedoraConDetalle extends ConsignacionRevendedoraRow {
  revendedora: {
    nombre: string
    apellido: string
    telefono: string | null
    email: string | null
  }
  detalles: ConsignacionRevendedoraItemDetalle[]
}

export interface ConsignacionRevendedoraListItem {
  id_consignacion_revendedora: string
  id_revendedora: string
  estado: EstadoConsignacionRevendedora
  confirmada: boolean
  fecha_confirmacion: string | null
  fecha_cierre: string | null
  periodo_desde: string | null
  periodo_hasta: string | null
  observaciones: string | null
  created_at: string
  total_items: number
  items_en_poder: number
}

export interface StockPorTenenciaRow {
  id_producto: string
  disponible_central: number
  reservado_central: number
  en_revendedoras: number
  por_revendedora: Record<string, number> | null
}
