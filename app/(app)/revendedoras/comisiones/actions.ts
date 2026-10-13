'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal/session'
import { classifyAuthError, requireModuleRole } from '@/lib/dal/guard'
import {
  crearReglaGeneral,
  guardarComisionPropia,
  terminarRegla,
} from '@/lib/dal/revendedoras/comisiones'
import {
  crearReglaGeneralSchema,
  guardarComisionPropiaSchema,
  terminarReglaSchema,
} from '@/lib/validation/comisiones'

export async function crearReglaGeneralAction(input: unknown) {
  try {
    // Puerta 1: Autorizar
    const session = await verifySession()
    await requireModuleRole(session, 'revendedoras', 'editar')

    // Puerta 2: Validar
    const parsed = crearReglaGeneralSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false as const, reason: 'payload-invalido' }
    }

    // Puerta 3: Llamar al DAL
    const res = await crearReglaGeneral(parsed.data)
    if (res.ok) {
      revalidatePath('/revendedoras/comisiones')
      revalidatePath('/revendedoras')
    }
    return res
  } catch (err) {
    const auth = classifyAuthError(err)
    if (auth.kind === 'auth') return { ok: false as const, reason: auth.reason }
    throw err
  }
}

export async function guardarComisionPropiaAction(input: unknown) {
  try {
    // Puerta 1: Autorizar
    const session = await verifySession()
    await requireModuleRole(session, 'revendedoras', 'editar')

    // Puerta 2: Validar
    const parsed = guardarComisionPropiaSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false as const, reason: 'payload-invalido' }
    }

    // Puerta 3: Llamar al DAL
    const res = await guardarComisionPropia(parsed.data)
    if (res.ok) {
      revalidatePath(`/revendedoras/${parsed.data.id_revendedora}`)
    }
    return res
  } catch (err) {
    const auth = classifyAuthError(err)
    if (auth.kind === 'auth') return { ok: false as const, reason: auth.reason }
    throw err
  }
}

export async function terminarReglaAction(input: unknown) {
  try {
    // Puerta 1: Autorizar
    const session = await verifySession()
    await requireModuleRole(session, 'revendedoras', 'editar')

    // Puerta 2: Validar
    const parsed = terminarReglaSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false as const, reason: 'payload-invalido' }
    }

    // Puerta 3: Llamar al DAL
    const res = await terminarRegla(parsed.data)
    if (res.ok) {
      revalidatePath('/revendedoras/comisiones')
    }
    return res
  } catch (err) {
    const auth = classifyAuthError(err)
    if (auth.kind === 'auth') return { ok: false as const, reason: auth.reason }
    throw err
  }
}
