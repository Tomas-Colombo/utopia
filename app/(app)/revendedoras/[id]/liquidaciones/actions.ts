'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal/session'
import { classifyAuthError, requireModuleRole } from '@/lib/dal/guard'
import {
  previewLiquidacionSchema,
  generarLiquidacionSchema,
  excluirDetalleLiquidacionSchema,
  reincluirDetalleLiquidacionSchema,
  marcarLiquidacionPagadaSchema,
} from '@/lib/validation/revendedoras'
import * as dal from '@/lib/dal/revendedoras'

export async function previewLiquidacionAction(input: unknown) {
  try {
    const session = await verifySession()
    await requireModuleRole(session, 'revendedoras', 'ver')

    const parsed = previewLiquidacionSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false as const, reason: 'payload-invalido' }
    }

    return await dal.previewLiquidacion(parsed.data)
  } catch (err) {
    const auth = classifyAuthError(err)
    if (auth.kind === 'auth') return { ok: false as const, reason: auth.reason }
    throw err
  }
}

export async function generarLiquidacionAction(input: unknown) {
  try {
    const session = await verifySession()
    await requireModuleRole(session, 'revendedoras', 'liquidar')

    const parsed = generarLiquidacionSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false as const, reason: 'payload-invalido' }
    }

    const res = await dal.generarLiquidacion(parsed.data)
    if (res.ok) {
      revalidatePath(`/revendedoras/${parsed.data.id_revendedora}`)
      revalidatePath(`/revendedoras/${parsed.data.id_revendedora}/liquidaciones`)
      revalidatePath(`/revendedoras/${parsed.data.id_revendedora}/cuenta`)
    }
    return res
  } catch (err) {
    const auth = classifyAuthError(err)
    if (auth.kind === 'auth') return { ok: false as const, reason: auth.reason }
    throw err
  }
}

export async function excluirDetalleLiquidacionAction(input: unknown) {
  try {
    const session = await verifySession()
    await requireModuleRole(session, 'revendedoras', 'liquidar')

    const parsed = excluirDetalleLiquidacionSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false as const, reason: 'payload-invalido' }
    }

    return await dal.excluirDetalleLiquidacion(parsed.data)
  } catch (err) {
    const auth = classifyAuthError(err)
    if (auth.kind === 'auth') return { ok: false as const, reason: auth.reason }
    throw err
  }
}

export async function reincluirDetalleLiquidacionAction(input: unknown) {
  try {
    const session = await verifySession()
    await requireModuleRole(session, 'revendedoras', 'liquidar')

    const parsed = reincluirDetalleLiquidacionSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false as const, reason: 'payload-invalido' }
    }

    return await dal.reincluirDetalleLiquidacion(parsed.data)
  } catch (err) {
    const auth = classifyAuthError(err)
    if (auth.kind === 'auth') return { ok: false as const, reason: auth.reason }
    throw err
  }
}

export async function marcarLiquidacionPagadaAction(input: unknown) {
  try {
    const session = await verifySession()
    await requireModuleRole(session, 'revendedoras', 'liquidar')

    const parsed = marcarLiquidacionPagadaSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false as const, reason: 'payload-invalido' }
    }

    const res = await dal.marcarLiquidacionPagada(parsed.data)
    if (res.ok) {
      revalidatePath(`/revendedoras`)
      revalidatePath(`/revendedoras/${parsed.data.id_liquidacion}`)
      revalidatePath(`/precios/cuentas`)
    }
    return res
  } catch (err) {
    const auth = classifyAuthError(err)
    if (auth.kind === 'auth') return { ok: false as const, reason: auth.reason }
    throw err
  }
}
