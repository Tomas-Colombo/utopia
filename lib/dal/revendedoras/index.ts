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

import { createServiceClient } from '../supabase'
import * as crypto from 'crypto'

export async function inviteRevendedora(session: Session, input: {
  idRevendedora: string
  email: string
  nombreCompleto: string
  password?: string
}) {
  const admin = createServiceClient()

  // Buscar rol
  const { data: rolData, error: rolError } = await admin
    .from('rol')
    .select('id_rol')
    .eq('id_tenant', session.tenantId)
    .eq('nombre', 'Revendedora')
    .single()
  
  if (rolError || !rolData) {
    return { ok: false as const, reason: 'error-rol-no-encontrado' }
  }

  // Comprobar que la revendedora no tiene acceso
  const { data: revData, error: revError } = await admin
    .from('revendedora')
    .select('id_usuario')
    .eq('id_tenant', session.tenantId)
    .eq('id_revendedora', input.idRevendedora)
    .single()
  
  if (revError || !revData) {
    return { ok: false as const, reason: 'revendedora-not-found' }
  }

  if (revData.id_usuario) {
    return { ok: false as const, reason: 'acceso-duplicado' }
  }

  const generatedPassword = input.password || (crypto.randomBytes(16).toString('hex') + 'A1!')

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: input.email,
    password: generatedPassword,
    email_confirm: true,
    user_metadata: { nombre_completo: input.nombreCompleto },
    app_metadata: { tenant_id: session.tenantId },
  })

  if (authError) {
    if (authError.status === 422) return { ok: false as const, reason: 'email-duplicado' }
    return { ok: false as const, reason: 'error-invitacion' }
  }
  
  if (!created.user) return { ok: false as const, reason: 'error-invitacion' }

  const authId = created.user.id

  const { error: linkError } = await admin.rpc('sp_enlazar_revendedora_usuario', {
    p_id_revendedora: input.idRevendedora,
    p_id_usuario: authId,
    p_id_tenant: session.tenantId,
    p_email: input.email,
    p_nombre: input.nombreCompleto,
    p_id_rol: rolData.id_rol
  })

  if (linkError) {
    await admin.auth.admin.deleteUser(authId)
    if (linkError.code === '23505') return { ok: false as const, reason: 'email-duplicado' }
    return { ok: false as const, reason: 'error-enlazar' }
  }

  return { ok: true as const, data: { id: authId } }
}

export async function revocarAccesoRevendedora(session: Session, input: { idRevendedora: string }) {
  const admin = createServiceClient()

  const { data: revData, error: revError } = await admin
    .from('revendedora')
    .select('id_usuario')
    .eq('id_tenant', session.tenantId)
    .eq('id_revendedora', input.idRevendedora)
    .single()
  
  if (revError || !revData) {
    return { ok: false as const, reason: 'revendedora-not-found' }
  }

  if (!revData.id_usuario) {
    return { ok: false as const, reason: 'sin-acceso' }
  }

  const authId = revData.id_usuario

  const { error: unlinkError } = await admin.from('revendedora').update({
    id_usuario: null,
  }).eq('id_revendedora', input.idRevendedora)

  if (unlinkError) {
    return { ok: false as const, reason: 'error-desvincular' }
  }

  const { error: userError } = await admin.from('usuario').update({
    estado_usuario: 'inactivo',
  }).eq('id_usuario', authId)

  if (userError) {
    return { ok: false as const, reason: 'error-desactivar' }
  }

  return { ok: true as const }
}
