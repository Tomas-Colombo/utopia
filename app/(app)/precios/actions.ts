'use server'

import { revalidatePath } from 'next/cache'
import { AuthorizationError } from '@/lib/dal/errors'
import { requireModuleRole } from '@/lib/dal/guard'
import { verifySession } from '@/lib/dal/session'
import {
  spBajaReglaPrecio,
  spCreateReglaPrecio,
  spExtenderVigenciaRegla,
} from '@/lib/dal/precios/regla'
import {
  listPlanesCuotas,
  setPlanCuotasActivo,
  upsertPlanCuotas,
} from '@/lib/dal/precios/cuotas'
import {
  spRecalcularBatch,
  spRecalcularPrecioVenta,
} from '@/lib/dal/precios/resolucion'
import {
  CUOTAS_MAX,
  CUOTAS_MIN,
  type AlcanceRegla,
  type FormaPago,
  type PlanCuotasRow,
  type TipoRegla,
  type TipoValorRegla,
} from '@/lib/types/precios'

type ActionResult<T = unknown> = { ok: true; data?: T } | { ok: false; reason: string }

type Guarded =
  | { ok: true; tenantId: string; userId: string }
  | { ok: false; error: string }

async function guarded(accion: string): Promise<Guarded> {
  try {
    const session = await verifySession()
    await requireModuleRole(session, 'precios', accion)
    return { ok: true, tenantId: session.tenantId, userId: session.user.id }
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: error.reason }
    throw error
  }
}

// ─── Reglas ──────────────────────────────────────────────────────────

export async function createReglaAction(input: {
  nombre: string
  tipo_regla: TipoRegla
  tipo_valor: TipoValorRegla
  valor: number
  alcance: AlcanceRegla
  id_producto?: string | null
  id_categoria?: string | null
  id_proveedor?: string | null
  forma_pago?: FormaPago | null
  prioridad?: number
  acumulable?: boolean
  fecha_inicio?: string | null
  fecha_hasta?: string | null
}): Promise<ActionResult<{ id: string }>> {
  const g = await guarded('crear')
  if (!g.ok) return { ok: false, reason: g.error }
  try {
    const id = await spCreateReglaPrecio(input)
    revalidatePath('/precios/reglas')
    revalidatePath('/precios/control')
    revalidatePath('/precios')
    return { ok: true, data: { id } }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function bajaReglaAction(idRegla: string): Promise<ActionResult> {
  const g = await guarded('eliminar')
  if (!g.ok) return { ok: false, reason: g.error }
  try {
    await spBajaReglaPrecio(idRegla)
    revalidatePath('/precios/reglas')
    revalidatePath('/precios/control')
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function extenderVigenciaReglaAction(input: {
  idRegla: string
  fechaHasta: string
}): Promise<ActionResult> {
  const g = await guarded('editar')
  if (!g.ok) return { ok: false, reason: g.error }
  try {
    await spExtenderVigenciaRegla(input.idRegla, input.fechaHasta)
    revalidatePath('/precios/reglas')
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

// ─── Planes de cuotas ────────────────────────────────────────────────

/**
 * Las acciones de cuotas devuelven la lista completa ya refrescada: el modal
 * se abre sobre pantallas que ya tenían los planes en props (nueva regla,
 * nueva venta) y así se actualizan sin recargar la página.
 */
type PlanesResult = ActionResult<{ planes: PlanCuotasRow[] }>

/** Las páginas que consumen planes activos en su desplegable. */
function revalidarPlanes() {
  revalidatePath('/precios/reglas')
  revalidatePath('/precios/reglas/nueva')
  revalidatePath('/ventas/nueva')
}

export async function crearPlanCuotasAction(cuotas: number): Promise<PlanesResult> {
  const g = await guarded('crear')
  if (!g.ok) return { ok: false, reason: g.error }
  if (!Number.isInteger(cuotas) || cuotas < CUOTAS_MIN || cuotas > CUOTAS_MAX) {
    return { ok: false, reason: `cuotas-fuera-de-rango (${CUOTAS_MIN}-${CUOTAS_MAX})` }
  }
  try {
    await upsertPlanCuotas(g.tenantId, cuotas)
    revalidarPlanes()
    return { ok: true, data: { planes: await listPlanesCuotas() } }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function setPlanCuotasActivoAction(
  cuotas: number,
  activo: boolean,
): Promise<PlanesResult> {
  const g = await guarded('editar')
  if (!g.ok) return { ok: false, reason: g.error }
  try {
    await setPlanCuotasActivo(cuotas, activo)
    revalidarPlanes()
    return { ok: true, data: { planes: await listPlanesCuotas() } }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

// ─── Recalcular precio ───────────────────────────────────────────────

export async function recalcularPrecioAction(
  idProducto: string,
): Promise<ActionResult<{ precio: number | null }>> {
  const g = await guarded('editar')
  if (!g.ok) return { ok: false, reason: g.error }
  try {
    const precio = await spRecalcularPrecioVenta(idProducto)
    revalidatePath('/precios/control')
    revalidatePath('/inventario/productos')
    return { ok: true, data: { precio } }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function recalcularBatchAction(
  ids: string[],
): Promise<ActionResult<{ resultados: Record<string, number | null> }>> {
  const g = await guarded('editar')
  if (!g.ok) return { ok: false, reason: g.error }
  if (ids.length === 0) return { ok: false, reason: 'ids-vacios' }
  if (ids.length > 500)
    return { ok: false, reason: 'demasiados-productos-en-un-batch' }
  try {
    const resultados = await spRecalcularBatch(ids)
    revalidatePath('/precios/control')
    revalidatePath('/inventario/productos')
    return { ok: true, data: { resultados } }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}
