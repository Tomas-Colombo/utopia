'use server'

import { revalidatePath } from 'next/cache'
import { AuthorizationError } from '@/lib/dal/errors'
import { requireModuleRole } from '@/lib/dal/guard'
import { verifySession } from '@/lib/dal/session'
import {
  spExcluirDetalleRendicion,
  spGenerarRendicion,
  spMarcarRendicionPagada,
  spReincluirDetalleRendicion,
} from '@/lib/dal/rendiciones/rendicion'
import {
  bajaCategoriaGasto,
  createCategoriaGasto,
  reactivarCategoriaGasto,
  renameCategoriaGasto,
  spRegistrarGasto,
  spSetPresupuesto,
} from '@/lib/dal/gastos/gasto'

type ActionResult<T = unknown> = { ok: true; data?: T } | { ok: false; reason: string }
type Guarded =
  | { ok: true; tenantId: string; userId: string }
  | { ok: false; error: string }

async function guarded(accion: string): Promise<Guarded> {
  try {
    const session = await verifySession()
    await requireModuleRole(session, 'rendiciones', accion)
    return { ok: true, tenantId: session.tenantId, userId: session.user.id }
  } catch (e) {
    if (e instanceof AuthorizationError) return { ok: false, error: e.reason }
    throw e
  }
}

// ─── Rendiciones ─────────────────────────────────────────────────────

export async function excluirDetalleAction(input: {
  idDetalle: string
  motivo?: string | null
}): Promise<ActionResult> {
  const g = await guarded('editar')
  if (!g.ok) return { ok: false, reason: g.error }
  try {
    await spExcluirDetalleRendicion(input)
    revalidatePath('/rendiciones/nueva')
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function reincluirDetalleAction(input: {
  idDetalle: string
}): Promise<ActionResult> {
  const g = await guarded('editar')
  if (!g.ok) return { ok: false, reason: g.error }
  try {
    await spReincluirDetalleRendicion(input.idDetalle)
    revalidatePath('/rendiciones/nueva')
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function generarRendicionAction(input: {
  idProveedor: string
  observaciones?: string | null
}): Promise<ActionResult<{ id: string }>> {
  const g = await guarded('crear')
  if (!g.ok) return { ok: false, reason: g.error }
  try {
    const id = await spGenerarRendicion({
      idProveedor: input.idProveedor,
      observaciones: input.observaciones ?? null,
    })
    revalidatePath('/rendiciones')
    revalidatePath('/rendiciones/nueva')
    return { ok: true, data: { id } }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function marcarRendicionPagadaAction(input: {
  idRendicion: string
  fechaPago?: string | null
}): Promise<ActionResult> {
  const g = await guarded('editar')
  if (!g.ok) return { ok: false, reason: g.error }
  try {
    await spMarcarRendicionPagada({
      idRendicion: input.idRendicion,
      fechaPago: input.fechaPago ?? null,
    })
    revalidatePath('/rendiciones')
    revalidatePath(`/rendiciones/${input.idRendicion}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

// ─── Gastos ──────────────────────────────────────────────────────────

export async function registrarGastoAction(input: {
  idCategoriaGasto: string
  monto: number
  descripcion: string
  fecha?: string | null
  comprobanteRef?: string | null
}): Promise<ActionResult<{ id: string }>> {
  const g = await guarded('crear')
  if (!g.ok) return { ok: false, reason: g.error }
  if (!input.descripcion?.trim()) return { ok: false, reason: 'descripcion-requerida' }
  if (!input.monto || input.monto <= 0) return { ok: false, reason: 'monto-invalido' }
  try {
    const id = await spRegistrarGasto({
      idCategoriaGasto: input.idCategoriaGasto,
      monto: input.monto,
      descripcion: input.descripcion.trim(),
      fecha: input.fecha ?? null,
      comprobanteRef: input.comprobanteRef?.trim() || null,
    })
    revalidatePath('/gastos')
    revalidatePath('/gastos/presupuestos')
    return { ok: true, data: { id } }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function setPresupuestoAction(input: {
  idCategoria: string
  presupuesto: number | null
}): Promise<ActionResult> {
  const g = await guarded('editar')
  if (!g.ok) return { ok: false, reason: g.error }
  try {
    await spSetPresupuesto(input)
    revalidatePath('/gastos/presupuestos')
    revalidatePath('/gastos')
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function createCategoriaGastoAction(input: {
  nombre: string
}): Promise<ActionResult<{ id: string }>> {
  const g = await guarded('crear')
  if (!g.ok) return { ok: false, reason: g.error }
  const nombre = input.nombre?.trim() ?? ''
  if (nombre.length < 2) return { ok: false, reason: 'nombre-corto' }
  try {
    const row = await createCategoriaGasto({ tenantId: g.tenantId, nombre })
    revalidatePath('/gastos')
    revalidatePath('/gastos/presupuestos')
    revalidatePath('/gastos/nuevo')
    return { ok: true, data: { id: row.id_categoria_gasto } }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function renameCategoriaGastoAction(input: {
  idCategoria: string
  nombre: string
}): Promise<ActionResult> {
  const g = await guarded('editar')
  if (!g.ok) return { ok: false, reason: g.error }
  const nombre = input.nombre?.trim() ?? ''
  if (nombre.length < 2) return { ok: false, reason: 'nombre-corto' }
  try {
    await renameCategoriaGasto(input.idCategoria, nombre)
    revalidatePath('/gastos')
    revalidatePath('/gastos/presupuestos')
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function bajaCategoriaGastoAction(input: {
  idCategoria: string
}): Promise<ActionResult<{ hardDeleted: boolean }>> {
  const g = await guarded('editar')
  if (!g.ok) return { ok: false, reason: g.error }
  try {
    const res = await bajaCategoriaGasto(input.idCategoria)
    revalidatePath('/gastos')
    revalidatePath('/gastos/presupuestos')
    revalidatePath('/gastos/nuevo')
    return { ok: true, data: res }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function reactivarCategoriaGastoAction(input: {
  idCategoria: string
}): Promise<ActionResult> {
  const g = await guarded('editar')
  if (!g.ok) return { ok: false, reason: g.error }
  try {
    await reactivarCategoriaGasto(input.idCategoria)
    revalidatePath('/gastos')
    revalidatePath('/gastos/presupuestos')
    revalidatePath('/gastos/nuevo')
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}
