import { createServerClient } from '../supabase'
import type { Session } from '../session'
import { requireModuleRole } from '../guard'
import type { RevendedoraPayload } from '../../validation/revendedoras'
import type { RevendedoraRow } from '../../types/revendedoras'

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

export async function crearRevendedora(payload: RevendedoraPayload) {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('sp_crear_revendedora', {
    p_nombre: payload.nombre,
    p_apellido: payload.apellido,
    p_telefono: payload.telefono || null,
    p_email: payload.email || null,
    p_notas: payload.notas || null,
  })

  if (error) {
    if (error.code === '23505') return { ok: false as const, reason: 'email-duplicado' }
    if (error.code === 'P0002') return { ok: false as const, reason: 'revendedora-not-found' }
    if (error.message.includes('modulo-revendedoras-deshabilitado')) return { ok: false as const, reason: 'modulo-revendedoras-deshabilitado' }
    if (error.message.includes('no-permission')) return { ok: false as const, reason: 'no-permission' }
    throw error
  }

  return { ok: true as const, data }
}

export async function editarRevendedora(id: string, payload: RevendedoraPayload) {
  const supabase = await createServerClient()
  const { error } = await supabase.rpc('sp_editar_revendedora', {
    p_id: id,
    p_nombre: payload.nombre,
    p_apellido: payload.apellido,
    p_telefono: payload.telefono || null,
    p_email: payload.email || null,
    p_notas: payload.notas || null,
  })

  if (error) {
    if (error.code === '23505') return { ok: false as const, reason: 'email-duplicado' }
    if (error.code === 'P0002' || error.message.includes('revendedora-not-found')) return { ok: false as const, reason: 'revendedora-not-found' }
    if (error.message.includes('modulo-revendedoras-deshabilitado')) return { ok: false as const, reason: 'modulo-revendedoras-deshabilitado' }
    if (error.message.includes('no-permission')) return { ok: false as const, reason: 'no-permission' }
    throw error
  }

  return { ok: true as const }
}

export async function bajaRevendedora(id: string) {
  const supabase = await createServerClient()
  const { error } = await supabase.rpc('sp_baja_revendedora', {
    p_id: id,
  })

  if (error) {
    if (error.code === 'P0002' || error.message.includes('revendedora-not-found')) return { ok: false as const, reason: 'revendedora-not-found' }
    if (error.message.includes('modulo-revendedoras-deshabilitado')) return { ok: false as const, reason: 'modulo-revendedoras-deshabilitado' }
    if (error.message.includes('no-permission')) return { ok: false as const, reason: 'no-permission' }
    throw error
  }

  return { ok: true as const }
}
