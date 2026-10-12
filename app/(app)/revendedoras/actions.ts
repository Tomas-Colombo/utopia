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

    const res = await dal.crearRevendedora(parsed.data.payload)
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

    const res = await dal.editarRevendedora(parsed.data.id, parsed.data.payload)
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

    const res = await dal.bajaRevendedora(parsed.data.id)
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

export async function darAccesoRevendedoraAction(input: unknown) {
  try {
    const session = await verifySession()
    await requireModuleRole(session, 'revendedoras', 'editar')
    await requireModuleRole(session, 'administracion', 'crear')

    const schema = z.object({
      idRevendedora: z.string().uuid(),
      email: z.string().email().max(255),
      nombreCompleto: z.string().max(200),
      password: z.string().optional()
    }).strict()

    const parsed = schema.safeParse(input)
    if (!parsed.success) {
      return { ok: false as const, reason: 'payload-invalido' }
    }

    const res = await dal.inviteRevendedora(session, parsed.data)
    if (res.ok) {
      revalidatePath('/revendedoras')
      revalidatePath('/administracion/usuarios')
    }
    return res
  } catch (error) {
    // We already do module guard properly above.
    const auth = classifyAuthError(error)
    if (auth.kind === 'auth') return { ok: false as const, reason: auth.reason }
    return { ok: false as const, reason: 'error-desconocido' }
  }
}

export async function revocarAccesoRevendedoraAction(id: unknown) {
  try {
    const session = await verifySession()
    await requireModuleRole(session, 'revendedoras', 'editar')
    await requireModuleRole(session, 'administracion', 'eliminar')

    const schema = z.object({ id: z.string().uuid() }).strict()
    const parsed = schema.safeParse({ id })

    if (!parsed.success) {
      return { ok: false as const, reason: 'payload-invalido' }
    }

    const res = await dal.revocarAccesoRevendedora(session, { idRevendedora: parsed.data.id })
    if (res.ok) {
      revalidatePath('/revendedoras')
      revalidatePath('/administracion/usuarios')
    }
    return res
  } catch (error) {
    const auth = classifyAuthError(error)
    if (auth.kind === 'auth') return { ok: false as const, reason: auth.reason }
    return { ok: false as const, reason: 'error-desconocido' }
  }
}
