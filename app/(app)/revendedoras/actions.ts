'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal/session'
import { classifyAuthError, requireModuleRole } from '@/lib/dal/guard'
import { revendedoraSchema } from '@/lib/validation/revendedoras'
import * as dal from '@/lib/dal/revendedoras'
import { z } from 'zod'

export async function crearRevendedoraAction(formData: unknown) {
  try {
    const session = await verifySession()
    await requireModuleRole(session, 'revendedoras', 'crear')
    
    const schema = z.object({ payload: revendedoraSchema }).strict()
    const parsed = schema.safeParse({ payload: formData })
    
    if (!parsed.success) {
      return { ok: false as const, reason: 'payload-invalido' }
    }

    const res = await dal.crearRevendedora( parsed.data.payload)
    if (res.ok) {
      revalidatePath('/revendedoras')
    }
    return res
  } catch (err) {
    const auth = classifyAuthError(err)
    if (auth.kind === 'auth') return { ok: false as const, reason: auth.reason }
    throw err
  }
}

export async function editarRevendedoraAction(id: string, formData: unknown) {
  try {
    const session = await verifySession()
    await requireModuleRole(session, 'revendedoras', 'editar')
    
    const schema = z.object({ id: z.string().uuid(), payload: revendedoraSchema }).strict()
    const parsed = schema.safeParse({ id, payload: formData })
    
    if (!parsed.success) {
      return { ok: false as const, reason: 'payload-invalido' }
    }

    const res = await dal.editarRevendedora( parsed.data.id, parsed.data.payload)
    if (res.ok) {
      revalidatePath('/revendedoras')
      revalidatePath(`/revendedoras/${parsed.data.id}`)
    }
    return res
  } catch (err) {
    const auth = classifyAuthError(err)
    if (auth.kind === 'auth') return { ok: false as const, reason: auth.reason }
    throw err
  }
}

export async function bajaRevendedoraAction(id: string) {
  try {
    const session = await verifySession()
    await requireModuleRole(session, 'revendedoras', 'eliminar')
    
    const schema = z.object({ id: z.string().uuid() }).strict()
    const parsed = schema.safeParse({ id })
    
    if (!parsed.success) {
      return { ok: false as const, reason: 'payload-invalido' }
    }

    const res = await dal.bajaRevendedora( parsed.data.id)
    if (res.ok) {
      revalidatePath('/revendedoras')
      revalidatePath(`/revendedoras/${parsed.data.id}`)
    }
    return res
  } catch (err) {
    const auth = classifyAuthError(err)
    if (auth.kind === 'auth') return { ok: false as const, reason: auth.reason }
    throw err
  }
}

export async function darAccesoRevendedoraAction(input: {
  idRevendedora: string
  email: string
  nombreCompleto: string
  password?: string
}) {
  try {
    const session = await verifySession()
    const { id: authId } = await dal.inviteRevendedora(session, input)
    revalidatePath('/revendedoras')
    revalidatePath('/administracion/usuarios')
    return { ok: true as const, data: { id: authId } }
  } catch (error) {
    const msg = (error as Error).message
    if (msg.includes('email-duplicado') || msg.includes('already registered')) return { ok: false as const, reason: 'email-duplicado' }
    if (msg.includes('acceso configurado')) return { ok: false as const, reason: 'acceso-duplicado' }
    return { ok: false as const, reason: classifyAuthError(error) }
  }
}

export async function revocarAccesoRevendedoraAction(idRevendedora: string) {
  try {
    const session = await verifySession()
    await dal.revocarAccesoRevendedora(session, { idRevendedora })
    revalidatePath('/revendedoras')
    revalidatePath('/administracion/usuarios')
    return { ok: true as const }
  } catch (error) {
    return { ok: false as const, reason: classifyAuthError(error) }
  }
}
