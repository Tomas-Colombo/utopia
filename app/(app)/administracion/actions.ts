'use server'

import { revalidatePath } from 'next/cache'
import { AuthorizationError } from '@/lib/dal/errors'
import { requireModuleRole } from '@/lib/dal/guard'
import { verifySession } from '@/lib/dal/session'
import {
  inviteUsuario,
  spAsignarRol,
  spCreateRol,
  spDeleteRol,
  spToggleTenantModulo,
  spToggleUsuarioActivo,
  spUpdateRol,
} from '@/lib/dal/administracion/administracion'
import type { UsuarioEstado } from '@/lib/types/administracion'

type ActionResult<T = unknown> = { ok: true; data?: T } | { ok: false; reason: string }
type Guarded =
  | { ok: true; tenantId: string; userId: string }
  | { ok: false; error: string }

async function guarded(accion: string): Promise<Guarded> {
  try {
    const session = await verifySession()
    await requireModuleRole(session, 'administracion', accion)
    return { ok: true, tenantId: session.tenantId, userId: session.user.id }
  } catch (e) {
    if (e instanceof AuthorizationError) return { ok: false, error: e.reason }
    throw e
  }
}

export async function toggleUsuarioEstadoAction(input: {
  idUsuario: string
  estado: UsuarioEstado
}): Promise<ActionResult> {
  const g = await guarded('editar')
  if (!g.ok) return { ok: false, reason: g.error }
  try {
    await spToggleUsuarioActivo(input.idUsuario, input.estado)
    revalidatePath('/administracion/usuarios')
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function invitarUsuarioAction(input: {
  email: string
  nombreCompleto: string
  idRol: string
  password: string
}): Promise<ActionResult<{ id: string }>> {
  const g = await guarded('crear')
  if (!g.ok) return { ok: false, reason: g.error }

  const email = input.email.trim().toLowerCase()
  if (!email.includes('@') || email.length < 5) return { ok: false, reason: 'email-invalido' }
  if (input.nombreCompleto.trim().length < 2) return { ok: false, reason: 'nombre-corto' }
  if (!input.idRol) return { ok: false, reason: 'rol-requerido' }
  if (input.password.length < 8) return { ok: false, reason: 'password-corto' }

  try {
    const res = await inviteUsuario({
      tenantId: g.tenantId,
      email,
      nombreCompleto: input.nombreCompleto.trim(),
      idRol: input.idRol,
      password: input.password,
    })
    revalidatePath('/administracion/usuarios')
    return { ok: true, data: res }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function asignarRolAction(input: {
  idUsuario: string
  idRol: string
  nombreCompleto?: string
}): Promise<ActionResult> {
  const g = await guarded('editar')
  if (!g.ok) return { ok: false, reason: g.error }
  try {
    await spAsignarRol(input.idUsuario, input.idRol, input.nombreCompleto)
    revalidatePath('/administracion/usuarios')
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function createRolAction(input: {
  nombre: string
  permisos: Record<string, string[]>
}): Promise<ActionResult<{ id: string }>> {
  const g = await guarded('crear')
  if (!g.ok) return { ok: false, reason: g.error }
  if (input.nombre.trim().length < 2) return { ok: false, reason: 'nombre-corto' }
  try {
    const id = await spCreateRol({ nombre: input.nombre.trim(), permisos: input.permisos })
    revalidatePath('/administracion')
    return { ok: true, data: { id } }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function updateRolAction(input: {
  idRol: string
  nombre: string
  permisos: Record<string, string[]>
}): Promise<ActionResult> {
  const g = await guarded('editar')
  if (!g.ok) return { ok: false, reason: g.error }
  try {
    await spUpdateRol(input)
    revalidatePath('/administracion')
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function deleteRolAction(input: { idRol: string }): Promise<ActionResult> {
  const g = await guarded('eliminar')
  if (!g.ok) return { ok: false, reason: g.error }
  try {
    await spDeleteRol(input.idRol)
    revalidatePath('/administracion')
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function toggleTenantModuloAction(input: {
  idModulo: string
  habilitado: boolean
}): Promise<ActionResult> {
  const g = await guarded('editar')
  if (!g.ok) return { ok: false, reason: g.error }
  try {
    await spToggleTenantModulo(input)
    revalidatePath('/administracion/modulos')
    revalidatePath('/')
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}
