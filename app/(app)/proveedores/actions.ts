'use server'

import { revalidatePath } from 'next/cache'
import { AuthorizationError } from '@/lib/dal/errors'
import { requireModuleRole } from '@/lib/dal/guard'
import { verifySession } from '@/lib/dal/session'
import { updateProveedor } from '@/lib/dal/inventario/proveedor'

type ActionResult = { ok: true } | { ok: false; reason: string }

/**
 * Alta/baja lógica del proveedor. NO borra: setea `activo=false` para que
 * desaparezca de todos los selectores (ingresos, consignaciones, rendiciones,
 * reglas de precio, alta de producto) — que ya usan `listProveedoresActivos()`.
 * Los movimientos históricos y la deuda pendiente siguen quedando visibles
 * desde el perfil individual.
 */
export async function setProveedorActivoAction(input: {
  id: string
  activo: boolean
}): Promise<ActionResult> {
  try {
    const session = await verifySession()
    await requireModuleRole(session, 'inventario', 'editar')
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, reason: error.reason }
    throw error
  }
  try {
    await updateProveedor(input.id, { activo: input.activo })
    revalidatePath('/proveedores')
    revalidatePath(`/proveedores/${input.id}`)
    revalidatePath('/inventario')
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}
