export type RevendedoraEstado = 'activa' | 'baja'

export interface RevendedoraRow {
  id_revendedora: string
  id_tenant: string
  nombre: string
  apellido: string
  telefono: string | null
  email: string | null
  notas: string | null
  estado: RevendedoraEstado
  created_at: string
  updated_at: string
}
