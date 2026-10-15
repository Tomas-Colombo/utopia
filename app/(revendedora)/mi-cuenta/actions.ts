'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal/session'
import { classifyAuthError, requireModuleRole } from '@/lib/dal/guard'
import { AuthorizationError } from '@/lib/dal/errors'
import {
  declararVentaRevendedoraSchema,
  retirarDeclaracionSchema,
} from '@/lib/validation/revendedoras'
import * as dal from '@/lib/dal/revendedoras'

export async function declararVentaAction(input: unknown) {
  try {
    const session = await verifySession()
    if (!session.idRevendedora) {
      throw new AuthorizationError('no-permission')
    }
    await requireModuleRole(session, 'revendedoras', 'declarar')

    const parsed = declararVentaRevendedoraSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false as const, reason: 'payload-invalido' }
    }

    const res = await dal.declararVentaRevendedora(session, parsed.data)
    if (!res.ok) {
      return res
    }

    revalidatePath('/mi-cuenta')
    revalidatePath('/mi-cuenta/stock')
    revalidatePath('/mi-cuenta/declaraciones')
    return { ok: true as const, data: res.data }
  } catch (err) {
    const auth = classifyAuthError(err)
    if (auth.kind === 'auth') return { ok: false as const, reason: auth.reason }
    throw err
  }
}

export async function retirarDeclaracionAction(input: unknown) {
  try {
    const session = await verifySession()
    if (!session.idRevendedora) {
      throw new AuthorizationError('no-permission')
    }
    await requireModuleRole(session, 'revendedoras', 'declarar')

    const parsed = retirarDeclaracionSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false as const, reason: 'payload-invalido' }
    }

    const res = await dal.retirarDeclaracion(session, parsed.data)
    if (!res.ok) {
      return res
    }

    revalidatePath('/mi-cuenta')
    revalidatePath('/mi-cuenta/stock')
    revalidatePath('/mi-cuenta/declaraciones')
    return { ok: true as const }
  } catch (err) {
    const auth = classifyAuthError(err)
    if (auth.kind === 'auth') return { ok: false as const, reason: auth.reason }
    throw err
  }
}
