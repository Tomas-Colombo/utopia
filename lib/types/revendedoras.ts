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
