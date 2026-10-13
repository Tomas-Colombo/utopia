'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal/session'
import { classifyAuthError, requireModuleRole } from '@/lib/dal/guard'
import {
  crearConsignacionRevendedoraSchema,
  editarConsignacionRevendedoraSchema,
  confirmarConsignacionRevendedoraSchema,
  registrarDevolucionRevendedoraSchema,
  cerrarConsignacionRevendedoraSchema,
  eliminarConsignacionRevendedoraSchema,
} from '@/lib/validation/revendedoras'
import * as dal from '@/lib/dal/revendedoras'

export async function crearConsignacionRevendedoraAction(input: unknown) {
  try {
    const session = await verifySession()
    await requireModuleRole(session, 'revendedoras', 'crear')

    const parsed = crearConsignacionRevendedoraSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false as const, reason: 'payload-invalido' }
    }

    const res = await dal.crearConsignacionRevendedora(parsed.data)
    if (res.ok) {
      revalidatePath(`/revendedoras/${parsed.data.id_revendedora}`)
      revalidatePath(`/revendedoras/${parsed.data.id_revendedora}/consignaciones`)
      revalidatePath('/inventario')
    }
    return res
  } catch (err) {
    const auth = classifyAuthError(err)
    if (auth.kind === 'auth') return { ok: false as const, reason: auth.reason }
    throw err
  }
}

export async function editarConsignacionRevendedoraAction(idRevendedora: string, input: unknown) {
  try {
    const session = await verifySession()
    await requireModuleRole(session, 'revendedoras', 'editar')

    const parsed = editarConsignacionRevendedoraSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false as const, reason: 'payload-invalido' }
    }

    const res = await dal.editarConsignacionRevendedora(parsed.data)
    if (res.ok) {
      revalidatePath(`/revendedoras/${idRevendedora}`)
      revalidatePath(`/revendedoras/${idRevendedora}/consignaciones`)
      revalidatePath(`/revendedoras/${idRevendedora}/consignaciones/${parsed.data.id_consignacion_revendedora}`)
    }
    return res
  } catch (err) {
    const auth = classifyAuthError(err)
    if (auth.kind === 'auth') return { ok: false as const, reason: auth.reason }
    throw err
  }
}

export async function confirmarConsignacionRevendedoraAction(idRevendedora: string, input: unknown) {
  try {
    const session = await verifySession()
    await requireModuleRole(session, 'revendedoras', 'crear')

    const parsed = confirmarConsignacionRevendedoraSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false as const, reason: 'payload-invalido' }
    }

    const res = await dal.confirmarConsignacionRevendedora(parsed.data.id_consignacion_revendedora)
    if (res.ok) {
      revalidatePath(`/revendedoras/${idRevendedora}`)
      revalidatePath(`/revendedoras/${idRevendedora}/consignaciones`)
      revalidatePath(`/revendedoras/${idRevendedora}/consignaciones/${parsed.data.id_consignacion_revendedora}`)
      revalidatePath('/inventario')
    }
    return res
  } catch (err) {
    const auth = classifyAuthError(err)
    if (auth.kind === 'auth') return { ok: false as const, reason: auth.reason }
    throw err
  }
}

export async function registrarDevolucionRevendedoraAction(idRevendedora: string, input: unknown) {
  try {
    const session = await verifySession()
    await requireModuleRole(session, 'revendedoras', 'editar')

    const parsed = registrarDevolucionRevendedoraSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false as const, reason: 'payload-invalido' }
    }

    const res = await dal.registrarDevolucionRevendedora(parsed.data)
    if (res.ok) {
      revalidatePath(`/revendedoras/${idRevendedora}`)
      revalidatePath(`/revendedoras/${idRevendedora}/consignaciones`)
      revalidatePath(`/revendedoras/${idRevendedora}/consignaciones/${parsed.data.id_consignacion_revendedora}`)
      revalidatePath('/inventario')
    }
    return res
  } catch (err) {
    const auth = classifyAuthError(err)
    if (auth.kind === 'auth') return { ok: false as const, reason: auth.reason }
    throw err
  }
}

export async function cerrarConsignacionRevendedoraAction(idRevendedora: string, input: unknown) {
  try {
    const session = await verifySession()
    await requireModuleRole(session, 'revendedoras', 'editar')

    const parsed = cerrarConsignacionRevendedoraSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false as const, reason: 'payload-invalido' }
    }

    const res = await dal.cerrarConsignacionRevendedora(parsed.data.id_consignacion_revendedora)
    if (res.ok) {
      revalidatePath(`/revendedoras/${idRevendedora}`)
      revalidatePath(`/revendedoras/${idRevendedora}/consignaciones`)
      revalidatePath(`/revendedoras/${idRevendedora}/consignaciones/${parsed.data.id_consignacion_revendedora}`)
    }
    return res
  } catch (err) {
    const auth = classifyAuthError(err)
    if (auth.kind === 'auth') return { ok: false as const, reason: auth.reason }
    throw err
  }
}

export async function eliminarConsignacionRevendedoraAction(idRevendedora: string, input: unknown) {
  try {
    const session = await verifySession()
    await requireModuleRole(session, 'revendedoras', 'eliminar')

    const parsed = eliminarConsignacionRevendedoraSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false as const, reason: 'payload-invalido' }
    }

    const res = await dal.eliminarConsignacionRevendedora(parsed.data.id_consignacion_revendedora)
    if (res.ok) {
      revalidatePath(`/revendedoras/${idRevendedora}`)
      revalidatePath(`/revendedoras/${idRevendedora}/consignaciones`)
      revalidatePath('/inventario')
    }
    return res
  } catch (err) {
    const auth = classifyAuthError(err)
    if (auth.kind === 'auth') return { ok: false as const, reason: auth.reason }
    throw err
  }
}
