export type AmbitoComision = 'revendedora' | 'local'

export interface ReglaComisionRow {
  id_regla: string
  id_tenant: string
  ambito: AmbitoComision
  id_revendedora: string | null
  nombre: string
  vigente_desde: string
  vigente_hasta: string | null
  activo: boolean
  created_at: string
  updated_at: string
}

export interface EscalaComisionRow {
  id_escala: string
  id_tenant: string
  id_regla: string
  objetivo_desde: number
  porcentaje: number
  created_at: string
}

export interface ReglaComisionConEscalas extends ReglaComisionRow {
  escalas: EscalaComisionRow[]
}

export interface ResolucionComision {
  porcentaje: number
  origen: 'propia' | 'general' | 'ninguna'
  id_regla: string | null
  sin_regla: boolean
}

export interface EstimacionComision {
  porcentaje: number
  montoEstimado: number
}
