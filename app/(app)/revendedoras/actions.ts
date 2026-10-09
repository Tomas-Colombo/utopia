'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal/session'
import { classifyAuthError } from '@/lib/dal/guard'
import { revendedoraSchema } from '@/lib/validation/revendedoras'
import * as dal from '@/lib/dal/revendedoras'

export async function crearRevendedoraAction(formData: unknown) {
  try {
    const session = await verifySession()
    const parsed = revendedoraSchema.safeParse(formData)
    if (!parsed.success) {
      return { ok: false, reason: 'payload-invalido' }
    }

    const res = await dal.crearRevendedora(session, parsed.data)
    if (res.ok) {
      revalidatePath('/revendedoras')
    }
    return res
  } catch (err) {
    const auth = classifyAuthError(err)
    if (auth.kind === 'auth') return { ok: false, reason: auth.reason }
    throw err
  }
}

export async function editarRevendedoraAction(id: string, formData: unknown) {
  try {
    const session = await verifySession()
    const parsed = revendedoraSchema.safeParse(formData)
    if (!parsed.success) {
      return { ok: false, reason: 'payload-invalido' }
    }

    const res = await dal.editarRevendedora(session, id, parsed.data)
    if (res.ok) {
      revalidatePath('/revendedoras')
      revalidatePath(`/revendedoras/${id}`)
    }
    return res
  } catch (err) {
    const auth = classifyAuthError(err)
    if (auth.kind === 'auth') return { ok: false, reason: auth.reason }
    throw err
  }
}

export async function bajaRevendedoraAction(id: string) {
  try {
    const session = await verifySession()
    const res = await dal.bajaRevendedora(session, id)
    if (res.ok) {
      revalidatePath('/revendedoras')
      revalidatePath(`/revendedoras/${id}`)
    }
    return res
  } catch (err) {
    const auth = classifyAuthError(err)
    if (auth.kind === 'auth') return { ok: false, reason: auth.reason }
    throw err
  }
}
