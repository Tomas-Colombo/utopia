'use server'

import { revalidatePath } from 'next/cache'
import { AuthorizationError } from '@/lib/dal/errors'
import { requireModuleRole } from '@/lib/dal/guard'
import { verifySession } from '@/lib/dal/session'
import {
  createCliente,
  toggleClienteActivo,
  updateCliente,
} from '@/lib/dal/clientes/cliente'
import {
  spAnularVenta,
  spRegistrarDevolucionCliente,
  spRegistrarVenta,
} from '@/lib/dal/ventas/venta'
import { spEmitirComprobante } from '@/lib/dal/ventas/comprobante'
import {
  spCancelarReserva,
  spCrearReserva,
  spVencerReservas,
} from '@/lib/dal/reservas/reserva'
import type { FormaPago } from '@/lib/types/precios'
import type { TipoComprobante } from '@/lib/types/ventas'

type ActionResult<T = unknown> = { ok: true; data?: T } | { ok: false; reason: string }
type Guarded =
  | { ok: true; tenantId: string; userId: string }
  | { ok: false; error: string }

async function guarded(modulo: string, accion: string): Promise<Guarded> {
  try {
    const session = await verifySession()
    await requireModuleRole(session, modulo, accion)
    return { ok: true, tenantId: session.tenantId, userId: session.user.id }
  } catch (e) {
    if (e instanceof AuthorizationError) return { ok: false, error: e.reason }
    throw e
  }
}

// ─── Ventas ──────────────────────────────────────────────────────────

export async function registrarVentaAction(input: {
  lineas: Array<{ id_item: string; descuentos?: string[] }>
  formaPago: FormaPago
  idCliente?: string | null
  idReserva?: string | null
  observaciones?: string | null
}): Promise<ActionResult<{ id: string }>> {
  const g = await guarded('ventas', 'crear')
  if (!g.ok) return { ok: false, reason: g.error }
  if (input.lineas.length === 0) return { ok: false, reason: 'lineas-vacias' }
  try {
    const id = await spRegistrarVenta({
      lineas: input.lineas,
      forma_pago: input.formaPago,
      id_cliente: input.idCliente ?? null,
      id_reserva: input.idReserva ?? null,
      observaciones: input.observaciones ?? null,
    })
    revalidatePath('/ventas')
    revalidatePath('/inventario/productos')
    revalidatePath('/inventario')
    if (input.idReserva) revalidatePath(`/ventas/reservas/${input.idReserva}`)
    return { ok: true, data: { id } }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function anularVentaAction(input: {
  idVenta: string
  motivo?: string
}): Promise<ActionResult> {
  const g = await guarded('ventas', 'editar')
  if (!g.ok) return { ok: false, reason: g.error }
  try {
    await spAnularVenta(input.idVenta, input.motivo)
    revalidatePath('/ventas')
    revalidatePath(`/ventas/${input.idVenta}`)
    revalidatePath('/inventario/productos')
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function devolverItemVentaAction(input: {
  idDetalleVenta: string
  idVenta: string
  motivo?: string
}): Promise<ActionResult> {
  const g = await guarded('ventas', 'editar')
  if (!g.ok) return { ok: false, reason: g.error }
  try {
    await spRegistrarDevolucionCliente(input.idDetalleVenta, input.motivo)
    revalidatePath(`/ventas/${input.idVenta}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function emitirComprobanteAction(input: {
  idVenta: string
  tipo: TipoComprobante
  numero: string
}): Promise<ActionResult<{ id: string }>> {
  const g = await guarded('ventas', 'crear')
  if (!g.ok) return { ok: false, reason: g.error }
  try {
    const id = await spEmitirComprobante({
      idVenta: input.idVenta,
      tipo: input.tipo,
      numero: input.numero.trim(),
    })
    revalidatePath(`/ventas/${input.idVenta}`)
    return { ok: true, data: { id } }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

// ─── Reservas ────────────────────────────────────────────────────────

export async function crearReservaAction(input: {
  idCliente: string | null
  items: string[]
  fechaVencimiento: string
  observaciones?: string | null
}): Promise<ActionResult<{ id: string }>> {
  const g = await guarded('ventas', 'crear')
  if (!g.ok) return { ok: false, reason: g.error }
  if (input.items.length === 0) return { ok: false, reason: 'items-vacios' }
  try {
    const id = await spCrearReserva({
      idCliente: input.idCliente,
      items: input.items,
      fechaVencimiento: input.fechaVencimiento,
      observaciones: input.observaciones ?? null,
    })
    revalidatePath('/ventas/reservas')
    return { ok: true, data: { id } }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function cancelarReservaAction(input: {
  idReserva: string
  motivo?: string
}): Promise<ActionResult> {
  const g = await guarded('ventas', 'editar')
  if (!g.ok) return { ok: false, reason: g.error }
  try {
    await spCancelarReserva(input.idReserva, input.motivo)
    revalidatePath('/ventas/reservas')
    revalidatePath(`/ventas/reservas/${input.idReserva}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function vencerReservasAction(): Promise<ActionResult<{ vencidas: number }>> {
  const g = await guarded('ventas', 'editar')
  if (!g.ok) return { ok: false, reason: g.error }
  try {
    const vencidas = await spVencerReservas()
    revalidatePath('/ventas/reservas')
    return { ok: true, data: { vencidas } }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

// ─── Clientes ────────────────────────────────────────────────────────

export async function crearClienteAction(input: {
  nombre: string
  telefono?: string | null
  email?: string | null
  notas?: string | null
}): Promise<ActionResult<{ id: string }>> {
  const g = await guarded('ventas', 'crear')
  if (!g.ok) return { ok: false, reason: g.error }
  if (input.nombre.trim().length < 2) return { ok: false, reason: 'nombre-invalido' }
  try {
    const row = await createCliente({
      id_tenant: g.tenantId,
      nombre: input.nombre.trim(),
      telefono: input.telefono?.trim() || null,
      email: input.email?.trim() || null,
      notas: input.notas?.trim() || null,
    })
    revalidatePath('/clientes')
    return { ok: true, data: { id: row.id_cliente } }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function updateClienteAction(input: {
  id: string
  patch: {
    nombre?: string
    telefono?: string | null
    email?: string | null
    notas?: string | null
  }
}): Promise<ActionResult> {
  const g = await guarded('ventas', 'editar')
  if (!g.ok) return { ok: false, reason: g.error }
  try {
    await updateCliente(input.id, input.patch)
    revalidatePath('/clientes')
    revalidatePath(`/clientes/${input.id}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function toggleClienteActivoAction(input: {
  id: string
  activo: boolean
}): Promise<ActionResult> {
  const g = await guarded('ventas', 'editar')
  if (!g.ok) return { ok: false, reason: g.error }
  try {
    await toggleClienteActivo(input.id, input.activo)
    revalidatePath('/clientes')
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}
