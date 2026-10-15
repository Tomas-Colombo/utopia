'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal/session'
import { classifyAuthError, requireModuleRole } from '@/lib/dal/guard'
import { AuthorizationError } from '@/lib/dal/errors'
import {
  confirmarDeclaracionVentaSchema,
  rechazarDeclaracionVentaSchema,
} from '@/lib/validation/revendedoras'
import * as dal from '@/lib/dal/revendedoras'

export async function confirmarDeclaracionAction(input: unknown) {
  try {
    const session = await verifySession()
    if (session.idRevendedora) {
      throw new AuthorizationError('no-permission')
    }
    await requireModuleRole(session, 'revendedoras', 'crear')

    const parsed = confirmarDeclaracionVentaSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false as const, reason: 'payload-invalido' }
    }

    const res = await dal.confirmarDeclaracionVenta(session, parsed.data)
    if (!res.ok) {
      return res
    }

    revalidatePath('/revendedoras')
    revalidatePath('/revendedoras/declaraciones')
    return { ok: true as const, data: res.data }
  } catch (err) {
    const auth = classifyAuthError(err)
    if (auth.kind === 'auth') return { ok: false as const, reason: auth.reason }
    throw err
  }
}

export async function rechazarDeclaracionAction(input: unknown) {
  try {
    const session = await verifySession()
    if (session.idRevendedora) {
      throw new AuthorizationError('no-permission')
    }
    await requireModuleRole(session, 'revendedoras', 'crear')

    const parsed = rechazarDeclaracionVentaSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false as const, reason: 'payload-invalido' }
    }

    const res = await dal.rechazarDeclaracionVenta(session, parsed.data)
    if (!res.ok) {
      return res
    }

    revalidatePath('/revendedoras')
    revalidatePath('/revendedoras/declaraciones')
    return { ok: true as const }
  } catch (err) {
    const auth = classifyAuthError(err)
    if (auth.kind === 'auth') return { ok: false as const, reason: auth.reason }
    throw err
  }
}
