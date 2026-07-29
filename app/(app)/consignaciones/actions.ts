'use server'

import { revalidatePath } from 'next/cache'
import { AuthorizationError } from '@/lib/dal/errors'
import { requireModuleRole } from '@/lib/dal/guard'
import { verifySession } from '@/lib/dal/session'
import {
  spAgregarItemConsignacion,
  spCancelarItemConsignacion,
  spCerrarConsignacion,
  spConfirmarSalidaItem,
  spCrearConsignacion,
  spRegistrarAjusteInventario,
} from '@/lib/dal/consignaciones/consignacion'

type ActionResult<T = unknown> = { ok: true; data?: T } | { ok: false; reason: string }
type Guarded =
  | { ok: true; tenantId: string; userId: string }
  | { ok: false; error: string }

async function guarded(accion: string): Promise<Guarded> {
  try {
    const session = await verifySession()
    await requireModuleRole(session, 'consignaciones', accion)
    return { ok: true, tenantId: session.tenantId, userId: session.user.id }
  } catch (e) {
    if (e instanceof AuthorizationError) return { ok: false, error: e.reason }
    throw e
  }
}

export async function crearConsignacionAction(input: {
  idProveedor: string
  observaciones?: string | null
}): Promise<ActionResult<{ id: string }>> {
  const g = await guarded('crear')
  if (!g.ok) return { ok: false, reason: g.error }
  try {
    const id = await spCrearConsignacion({
      idProveedor: input.idProveedor,
      observaciones: input.observaciones ?? null,
    })
    revalidatePath('/consignaciones')
    return { ok: true, data: { id } }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function agregarItemConsignacionAction(input: {
  idConsignacion: string
  idItem: string
  motivo?: string | null
}): Promise<ActionResult<{ id: string }>> {
  const g = await guarded('crear')
  if (!g.ok) return { ok: false, reason: g.error }
  try {
    const id = await spAgregarItemConsignacion({
      idConsignacion: input.idConsignacion,
      idItem: input.idItem,
      motivo: input.motivo ?? null,
    })
    revalidatePath(`/consignaciones/${input.idConsignacion}`)
    return { ok: true, data: { id } }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function cancelarItemConsignacionAction(input: {
  idDetalle: string
  idConsignacion: string
  motivo?: string
}): Promise<ActionResult> {
  const g = await guarded('editar')
  if (!g.ok) return { ok: false, reason: g.error }
  try {
    await spCancelarItemConsignacion(input.idDetalle, input.motivo)
    revalidatePath(`/consignaciones/${input.idConsignacion}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function confirmarSalidaItemAction(input: {
  idDetalle: string
  idConsignacion: string
}): Promise<ActionResult> {
  const g = await guarded('editar')
  if (!g.ok) return { ok: false, reason: g.error }
  try {
    await spConfirmarSalidaItem(input.idDetalle)
    revalidatePath(`/consignaciones/${input.idConsignacion}`)
    revalidatePath('/inventario/productos')
    revalidatePath('/inventario')
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function cerrarConsignacionAction(input: {
  idConsignacion: string
}): Promise<ActionResult> {
  const g = await guarded('editar')
  if (!g.ok) return { ok: false, reason: g.error }
  try {
    await spCerrarConsignacion(input.idConsignacion)
    revalidatePath('/consignaciones')
    revalidatePath(`/consignaciones/${input.idConsignacion}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

// ─── Ajuste de inventario (Etapa 6, §L86) ───────────────────────────
// Vive como acción del módulo 'inventario' pero se coloca acá porque
// comparte semántica con consignación (ambos son mundo "no-venta").

export async function registrarAjusteInventarioAction(input: {
  idItem: string
  cantidadSistema: number
  cantidadContada: number
  observaciones: string
  darDeBaja?: boolean
}): Promise<ActionResult<{ idMovimiento: string }>> {
  try {
    const session = await verifySession()
    await requireModuleRole(session, 'inventario', 'editar')
  } catch (e) {
    if (e instanceof AuthorizationError) return { ok: false, reason: e.reason }
    throw e
  }
  if (!input.observaciones?.trim()) return { ok: false, reason: 'observaciones-requeridas' }
  try {
    const id = await spRegistrarAjusteInventario({
      idItem: input.idItem,
      cantidadSistema: input.cantidadSistema,
      cantidadContada: input.cantidadContada,
      observaciones: input.observaciones.trim(),
      darDeBaja: input.darDeBaja ?? false,
    })
    revalidatePath('/inventario/productos')
    revalidatePath('/inventario')
    return { ok: true, data: { idMovimiento: id } }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}
