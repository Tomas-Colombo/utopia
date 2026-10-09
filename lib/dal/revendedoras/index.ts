import { createServerClient } from '../supabase'
import type { Session } from '../session'
import type { RevendedoraPayload } from '../../validation/revendedoras'
import type { RevendedoraRow } from '../../types/revendedoras'
import { requireModuleRole } from '../guard'

export async function listarRevendedoras(session: Session) {
  await requireModuleRole(session, 'revendedoras', 'ver')
  
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('revendedora')
    .select('*')
    .order('nombre', { ascending: true })

  if (error) throw error
  return data as RevendedoraRow[]
}

export async function obtenerRevendedora(session: Session, id: string) {
  await requireModuleRole(session, 'revendedoras', 'ver')
  
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('revendedora')
    .select('*')
    .eq('id_revendedora', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return data as RevendedoraRow
}

export async function crearRevendedora(session: Session, payload: RevendedoraPayload) {
  await requireModuleRole(session, 'revendedoras', 'crear')
  
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('sp_crear_revendedora', {
    _nombre: payload.nombre,
    _apellido: payload.apellido,
    _telefono: payload.telefono || null,
    _email: payload.email || null,
    _notas: payload.notas || null,
  })

  if (error) {
    return { ok: false as const, reason: error.message }
  }

  return { ok: true as const, data }
}

export async function editarRevendedora(session: Session, id: string, payload: RevendedoraPayload) {
  await requireModuleRole(session, 'revendedoras', 'editar')
  
  const supabase = await createServerClient()
  const { error } = await supabase.rpc('sp_editar_revendedora', {
    _id: id,
    _nombre: payload.nombre,
    _apellido: payload.apellido,
    _telefono: payload.telefono || null,
    _email: payload.email || null,
    _notas: payload.notas || null,
  })

  if (error) {
    return { ok: false as const, reason: error.message }
  }

  return { ok: true as const }
}

export async function bajaRevendedora(session: Session, id: string) {
  await requireModuleRole(session, 'revendedoras', 'eliminar')
  
  const supabase = await createServerClient()
  const { error } = await supabase.rpc('sp_baja_revendedora', {
    _id: id,
  })

  if (error) {
    return { ok: false as const, reason: error.message }
  }

  return { ok: true as const }
}

