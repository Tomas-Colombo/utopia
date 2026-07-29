'use server'

import { revalidatePath } from 'next/cache'
import { AuthorizationError } from '@/lib/dal/errors'
import { requireModuleRole } from '@/lib/dal/guard'
import { verifySession } from '@/lib/dal/session'
import {
  createCategoria,
  toggleCategoriaActiva,
} from '@/lib/dal/inventario/categoria'
import {
  createProveedor,
  updateProveedor,
} from '@/lib/dal/inventario/proveedor'
import {
  spCreateProducto,
  spSetCostoProducto,
} from '@/lib/dal/inventario/producto'
import { spTransicionItem } from '@/lib/dal/inventario/item'
import {
  addIngresoDetalle,
  createIngresoBorrador,
  removeIngresoDetalle,
  spConfirmarIngreso,
} from '@/lib/dal/inventario/ingreso'
import type { EstadoItem, TipoIngreso, TipoProveedor } from '@/lib/types/inventario'

/**
 * Server Actions del módulo Inventario.
 *
 * Contrato: cada acción devuelve `{ ok: true, ... }` o
 * `{ ok: false, reason: string }`. Nunca tira al cliente — atrapamos
 * AuthorizationError y devolvemos su `reason`. El caller (form/hook)
 * decide qué toast/redirect mostrar.
 */

type ActionResult<T = unknown> = { ok: true; data?: T } | { ok: false; reason: string }

async function guarded(accion: string): Promise<{ tenantId: string; userId: string } | { error: string }> {
  try {
    const session = await verifySession()
    await requireModuleRole(session, 'inventario', accion)
    return { tenantId: session.tenantId, userId: session.user.id }
  } catch (error) {
    if (error instanceof AuthorizationError) return { error: error.reason }
    throw error
  }
}

// ─── Categorías ──────────────────────────────────────────────────────

export async function createCategoriaAction(input: {
  nombre: string
  descripcion?: string | null
}): Promise<ActionResult<{ id: string }>> {
  const g = await guarded('crear')
  if ('error' in g) return { ok: false, reason: g.error }

  try {
    const row = await createCategoria({
      tenantId: g.tenantId,
      nombre: input.nombre.trim(),
      descripcion: input.descripcion?.trim() || null,
    })
    revalidatePath('/inventario/categorias')
    revalidatePath('/inventario')
    return { ok: true, data: { id: row.id_categoria } }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function toggleCategoriaActivaAction(input: {
  id: string
  activa: boolean
}): Promise<ActionResult> {
  const g = await guarded('editar')
  if ('error' in g) return { ok: false, reason: g.error }
  try {
    await toggleCategoriaActiva(input.id, input.activa)
    revalidatePath('/inventario/categorias')
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

// ─── Proveedores ─────────────────────────────────────────────────────

export async function createProveedorAction(input: {
  nombre: string
  tipo: TipoProveedor
  telefono?: string | null
  email?: string | null
  cuit?: string | null
  dias_rotacion?: number | null
  notas?: string | null
}): Promise<ActionResult<{ id: string }>> {
  const g = await guarded('crear')
  if ('error' in g) return { ok: false, reason: g.error }
  try {
    const row = await createProveedor({
      id_tenant: g.tenantId,
      nombre: input.nombre.trim(),
      tipo: input.tipo,
      telefono: input.telefono?.trim() || null,
      email: input.email?.trim() || null,
      cuit: input.cuit?.trim() || null,
      dias_rotacion: input.dias_rotacion ?? null,
      notas: input.notas?.trim() || null,
    })
    revalidatePath('/inventario/proveedores')
    return { ok: true, data: { id: row.id_proveedor } }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function updateProveedorAction(
  id: string,
  patch: {
    nombre?: string
    tipo?: TipoProveedor
    telefono?: string | null
    email?: string | null
    cuit?: string | null
    dias_rotacion?: number | null
    notas?: string | null
    activo?: boolean
  },
): Promise<ActionResult> {
  const g = await guarded('editar')
  if ('error' in g) return { ok: false, reason: g.error }
  try {
    await updateProveedor(id, patch)
    revalidatePath('/inventario/proveedores')
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

// ─── Productos ───────────────────────────────────────────────────────

export async function createProductoAction(input: {
  idCategoria: string
  nombre: string
  sku?: string | null
  stockMinimo?: number
  descripcion?: string | null
  costoInicial?: number | null
  moneda?: string
}): Promise<ActionResult<{ id: string }>> {
  const g = await guarded('crear')
  if ('error' in g) return { ok: false, reason: g.error }
  try {
    const id = await spCreateProducto({
      idCategoria: input.idCategoria,
      nombre: input.nombre.trim(),
      sku: input.sku?.trim() || null,
      stockMinimo: input.stockMinimo ?? 0,
      descripcion: input.descripcion?.trim() || null,
    })
    if (input.costoInicial != null && input.costoInicial > 0) {
      await spSetCostoProducto({
        idProducto: id,
        costo: input.costoInicial,
        moneda: input.moneda ?? 'ARS',
        motivo: 'costo inicial',
      })
    }
    revalidatePath('/inventario/productos')
    revalidatePath('/inventario')
    return { ok: true, data: { id } }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function setCostoProductoAction(input: {
  idProducto: string
  costo: number
  moneda?: string
  motivo?: string | null
}): Promise<ActionResult> {
  const g = await guarded('editar')
  if ('error' in g) return { ok: false, reason: g.error }
  try {
    await spSetCostoProducto({
      idProducto: input.idProducto,
      costo: input.costo,
      moneda: input.moneda ?? 'ARS',
      motivo: input.motivo ?? null,
    })
    revalidatePath('/inventario/productos')
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

// ─── Items ───────────────────────────────────────────────────────────

export async function transicionItemAction(input: {
  idItem: string
  estadoHasta: EstadoItem
  tipoMovimiento: string
  referenciaId?: string | null
  referenciaTipo?: string | null
}): Promise<ActionResult> {
  const g = await guarded('editar')
  if ('error' in g) return { ok: false, reason: g.error }
  try {
    await spTransicionItem(input)
    revalidatePath('/inventario/ficha')
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

// ─── Ingresos ────────────────────────────────────────────────────────

export async function createIngresoAction(input: {
  idProveedor: string
  tipoIngreso: TipoIngreso
  numeroRemito?: string | null
  observaciones?: string | null
  pdfUrl?: string | null
}): Promise<ActionResult<{ id: string }>> {
  const g = await guarded('crear')
  if ('error' in g) return { ok: false, reason: g.error }
  try {
    const id = await createIngresoBorrador({
      tenantId: g.tenantId,
      idProveedor: input.idProveedor,
      tipoIngreso: input.tipoIngreso,
      numeroRemito: input.numeroRemito?.trim() || null,
      observaciones: input.observaciones?.trim() || null,
      pdfUrl: input.pdfUrl?.trim() || null,
      idUsuarioAlta: g.userId,
    })
    revalidatePath('/inventario/ingresos')
    return { ok: true, data: { id } }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function addIngresoDetalleAction(input: {
  idIngreso: string
  idProducto: string
  cantidad: number
  costoUnitario: number
}): Promise<ActionResult<{ id: string }>> {
  const g = await guarded('crear')
  if ('error' in g) return { ok: false, reason: g.error }
  try {
    const id = await addIngresoDetalle({
      tenantId: g.tenantId,
      idIngreso: input.idIngreso,
      idProducto: input.idProducto,
      cantidad: input.cantidad,
      costoUnitario: input.costoUnitario,
    })
    revalidatePath(`/inventario/ingresos/${input.idIngreso}`)
    return { ok: true, data: { id } }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function removeIngresoDetalleAction(input: {
  idIngreso: string
  idDetalle: string
}): Promise<ActionResult> {
  const g = await guarded('editar')
  if ('error' in g) return { ok: false, reason: g.error }
  try {
    await removeIngresoDetalle(input.idDetalle)
    revalidatePath(`/inventario/ingresos/${input.idIngreso}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

/**
 * Confirmar ingreso = generar items físicos con QR único.
 * Idempotente en DB (sp_confirmar_ingreso devuelve 0 si ya está confirmado).
 */
export async function confirmarIngresoAction(input: {
  idIngreso: string
}): Promise<ActionResult<{ itemsGenerados: number }>> {
  const g = await guarded('crear')
  if ('error' in g) return { ok: false, reason: g.error }
  try {
    const count = await spConfirmarIngreso(input.idIngreso)
    revalidatePath('/inventario/ingresos')
    revalidatePath('/inventario/productos')
    revalidatePath('/inventario')
    return { ok: true, data: { itemsGenerados: count } }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}
