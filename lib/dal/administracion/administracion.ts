import 'server-only'
import { createServerClient } from '@/lib/dal/supabase'
import type {
  AuditoriaConActor,
  ModuloRow,
  RolRow,
  TenantModuloView,
  UsuarioConRol,
  UsuarioEstado,
} from '@/lib/types/administracion'

// ─── Usuarios ────────────────────────────────────────────────────────

export async function listUsuarios(): Promise<UsuarioConRol[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('usuario')
    .select(`
      id_usuario, id_tenant, email, nombre_completo, id_rol, estado_usuario,
      created_at, updated_at,
      rol:rol(id_rol, nombre)
    `)
    .order('email', { ascending: true })
  if (error) throw new Error(`listUsuarios: ${error.message}`)
  return (data ?? []) as unknown as UsuarioConRol[]
}

export async function spToggleUsuarioActivo(
  idUsuario: string,
  estado: UsuarioEstado,
): Promise<void> {
  const supabase = await createServerClient()
  const { error } = await supabase.rpc('sp_toggle_usuario_activo', {
    p_id_usuario: idUsuario,
    p_estado: estado,
  })
  if (error) throw new Error(`sp_toggle_usuario_activo: ${error.message}`)
}

export async function spAsignarRol(idUsuario: string, idRol: string, nombreCompleto?: string): Promise<void> {
  // Reutiliza sp_update_usuario (00009 — ya existente).
  const supabase = await createServerClient()
  const { error } = await supabase.rpc('sp_update_usuario', {
    p_id_usuario: idUsuario,
    p_nombre_completo: nombreCompleto ?? '',
    p_id_rol: idRol,
  })
  if (error) throw new Error(`sp_update_usuario: ${error.message}`)
}

// ─── Roles ───────────────────────────────────────────────────────────

export async function listRoles(): Promise<RolRow[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('rol').select('*').order('nombre', { ascending: true })
  if (error) throw new Error(`listRoles: ${error.message}`)
  return (data ?? []) as RolRow[]
}

export async function getRol(id: string): Promise<RolRow | null> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('rol').select('*').eq('id_rol', id).maybeSingle()
  if (error) throw new Error(`getRol: ${error.message}`)
  return (data ?? null) as RolRow | null
}

export async function spCreateRol(input: {
  nombre: string
  permisos: Record<string, string[]>
}): Promise<string> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('sp_create_rol', {
    p_nombre: input.nombre,
    p_permisos: input.permisos,
  })
  if (error) throw new Error(`sp_create_rol: ${error.message}`)
  return data as string
}

export async function spUpdateRol(input: {
  idRol: string
  nombre: string
  permisos: Record<string, string[]>
}): Promise<void> {
  const supabase = await createServerClient()
  const { error } = await supabase.rpc('sp_update_rol_permisos', {
    p_id_rol: input.idRol,
    p_nombre: input.nombre,
    p_permisos: input.permisos,
  })
  if (error) throw new Error(`sp_update_rol_permisos: ${error.message}`)
}

export async function spDeleteRol(idRol: string): Promise<void> {
  const supabase = await createServerClient()
  const { error } = await supabase.rpc('sp_delete_rol', { p_id_rol: idRol })
  if (error) throw new Error(`sp_delete_rol: ${error.message}`)
}

// ─── Módulos del tenant ──────────────────────────────────────────────

export async function listModulosTenant(): Promise<TenantModuloView[]> {
  const supabase = await createServerClient()
  // Catálogo de módulos + join con tenant_modulo para saber si está habilitado.
  const { data: catalog, error: e1 } = await supabase
    .from('modulo').select('id_modulo, codigo, nombre').order('nombre')
  if (e1) throw new Error(`listModulos catalog: ${e1.message}`)

  const { data: tm, error: e2 } = await supabase
    .from('tenant_modulo').select('id_modulo, habilitado')
  if (e2) throw new Error(`listModulos tm: ${e2.message}`)

  const habMap = new Map<string, boolean>()
  for (const row of tm ?? []) {
    habMap.set(row.id_modulo as string, row.habilitado as boolean)
  }

  return ((catalog ?? []) as ModuloRow[]).map((m) => ({
    ...m,
    habilitado: habMap.get(m.id_modulo) ?? false,
  }))
}

export async function spToggleTenantModulo(input: {
  idModulo: string
  habilitado: boolean
}): Promise<void> {
  const supabase = await createServerClient()
  const { error } = await supabase.rpc('sp_toggle_tenant_modulo', {
    p_id_modulo: input.idModulo,
    p_habilitado: input.habilitado,
  })
  if (error) throw new Error(`sp_toggle_tenant_modulo: ${error.message}`)
}

// ─── Auditoría ───────────────────────────────────────────────────────

export async function listAuditoria(opts?: {
  entidad?: string
  desde?: string
  hasta?: string
  limit?: number
}): Promise<AuditoriaConActor[]> {
  const supabase = await createServerClient()
  let q = supabase
    .from('auditoria')
    .select(`
      id_auditoria, id_tenant, id_usuario, entidad, entidad_id, accion,
      cambios, ts, ip,
      actor:usuario!auditoria_id_usuario_fkey(email, nombre_completo)
    `)
    .order('ts', { ascending: false })
    .limit(opts?.limit ?? 200)
  if (opts?.entidad) q = q.eq('entidad', opts.entidad)
  if (opts?.desde) q = q.gte('ts', opts.desde)
  if (opts?.hasta) q = q.lte('ts', opts.hasta)
  const { data, error } = await q
  if (error) {
    // Si la FK del select no existe con ese nombre, retry sin join
    // y sin actor (fallback más seguro que romper la página).
    const { data: raw, error: e2 } = await supabase
      .from('auditoria').select('*')
      .order('ts', { ascending: false })
      .limit(opts?.limit ?? 200)
    if (e2) throw new Error(`listAuditoria: ${error.message} / ${e2.message}`)
    return ((raw ?? []) as Array<Omit<AuditoriaConActor, 'actor_email' | 'actor_nombre'>>).map((r) => ({
      ...r,
      actor_email: null,
      actor_nombre: null,
    }))
  }
  return ((data ?? []) as unknown as Array<{
    id_auditoria: string
    id_tenant: string
    id_usuario: string | null
    entidad: string
    entidad_id: string | null
    accion: string
    cambios: Record<string, unknown>
    ts: string
    ip: string | null
    actor: { email: string; nombre_completo: string | null } | null
  }>).map((r) => ({
    id_auditoria: r.id_auditoria,
    id_tenant: r.id_tenant,
    id_usuario: r.id_usuario,
    entidad: r.entidad,
    entidad_id: r.entidad_id,
    accion: r.accion,
    cambios: r.cambios,
    ts: r.ts,
    ip: r.ip,
    actor_email: r.actor?.email ?? null,
    actor_nombre: r.actor?.nombre_completo ?? null,
  }))
}

/** Lista de entidades distintas para el filtro (dinámico). */
export async function listEntidadesAuditoria(): Promise<string[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('auditoria').select('entidad').limit(1000)
  if (error) return []
  const set = new Set<string>()
  for (const r of data ?? []) if (r.entidad) set.add(r.entidad as string)
  return Array.from(set).sort()
}
