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
import {
  spCobrarCuota,
  spMarcarCuotaIncobrable,
} from '@/lib/dal/cuotas/cuota'
import type { FormaPago } from '@/lib/types/precios'
import type {
  FinanciacionInput,
  FinanciadorInput,
  MedioPago,
  PagoInput,
  ResultadoIncobrable,
  TipoComprobante,
} from '@/lib/types/ventas'

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
  /** Cobranza. Omitido = un pago por el total contra la cuenta predeterminada. */
  pagos?: PagoInput[]
  /** Financiación propia (00059). Exige cliente. */
  financiacion?: FinanciacionInput | null
  financiador?: FinanciadorInput | null
}): Promise<ActionResult<{ id: string }>> {
  const g = await guarded('ventas', 'crear')
  if (!g.ok) return { ok: false, reason: g.error }
  if (input.lineas.length === 0) return { ok: false, reason: 'lineas-vacias' }
  // Se chequea acá además de en el SP: el error del RPC llega después de
  // haber empezado la transacción, y este es un dato que la UI ya tiene.
  if (input.financiacion && !input.idCliente) {
    return { ok: false, reason: 'financiacion-sin-cliente' }
  }
  try {
    const id = await spRegistrarVenta({
      lineas: input.lineas,
      forma_pago: input.formaPago,
      id_cliente: input.idCliente ?? null,
      id_reserva: input.idReserva ?? null,
      observaciones: input.observaciones ?? null,
      pagos: input.pagos,
      financiacion: input.financiacion ?? null,
      financiador: input.financiador ?? null,
    })
    revalidatePath('/ventas')
    revalidatePath('/inventario/productos')
    revalidatePath('/inventario')
    if (input.financiacion) revalidatePath('/cuotas')
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

/**
 * Alta de cliente. `apellido` es OBLIGATORIO desde 00058: la cartera se ordena
 * y se busca por ahí, y un cliente sin apellido es uno que no se va a poder
 * encontrar cuando deba plata.
 *
 * La columna sigue siendo NULLABLE en la DB a propósito: los clientes
 * anteriores a 00058 tienen su nombre completo en `nombre` y no se los puede
 * inventar. La obligatoriedad rige para las altas nuevas, acá y en el form.
 */
export async function crearClienteAction(input: {
  nombre: string
  apellido: string
  telefono?: string | null
  email?: string | null
  notas?: string | null
}): Promise<ActionResult<{ id: string }>> {
  const g = await guarded('ventas', 'crear')
  if (!g.ok) return { ok: false, reason: g.error }
  if (input.nombre.trim().length < 2) return { ok: false, reason: 'nombre-invalido' }
  if (input.apellido.trim().length < 2) return { ok: false, reason: 'apellido-invalido' }
  try {
    const row = await createCliente({
      id_tenant: g.tenantId,
      nombre: input.nombre.trim(),
      apellido: input.apellido.trim(),
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
    apellido?: string | null
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

// ─── Cuotas financiadas (00059) ──────────────────────────────────────

/**
 * Cobra una cuota, total o parcialmente. El SP genera el `pago_venta`: la
 * plata aparece en la caja del día en que ENTRÓ, no del día de la venta.
 */
export async function cobrarCuotaAction(input: {
  idCuota: string
  monto: number
  medio: MedioPago
  idCuentaDestino: string
  referencia?: string | null
}): Promise<ActionResult<{ idPago: string }>> {
  const g = await guarded('ventas', 'editar')
  if (!g.ok) return { ok: false, reason: g.error }
  if (!Number.isFinite(input.monto) || input.monto <= 0) {
    return { ok: false, reason: 'monto-invalido' }
  }
  if (!input.idCuentaDestino) return { ok: false, reason: 'pago-sin-cuenta' }
  try {
    const idPago = await spCobrarCuota({
      idCuota: input.idCuota,
      monto: input.monto,
      medio: input.medio,
      idCuentaDestino: input.idCuentaDestino,
      referencia: input.referencia ?? null,
    })
    revalidatePath('/cuotas')
    revalidatePath('/clientes')
    revalidatePath('/ventas')
    return { ok: true, data: { idPago } }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

/**
 * Da por perdida una cuota y TODAS las posteriores del mismo plan, y registra
 * un gasto por el total impago.
 *
 * Pide `eliminar` y no `editar` a propósito: esto borra deuda del panel y
 * genera un asiento de pérdida. Es el verbo más fuerte del catálogo de
 * permisos (ver supabase/seed.sql) y `PERMISOS_VENDEDOR` no lo tiene — un
 * vendedor no puede hacer desaparecer lo que un cliente debe.
 */
export async function marcarCuotaIncobrableAction(input: {
  idCuota: string
  motivo: string
}): Promise<ActionResult<ResultadoIncobrable>> {
  const g = await guarded('ventas', 'eliminar')
  if (!g.ok) return { ok: false, reason: g.error }
  if (input.motivo.trim().length < 3) return { ok: false, reason: 'motivo-requerido' }
  try {
    const res = await spMarcarCuotaIncobrable(input.idCuota, input.motivo.trim())
    revalidatePath('/cuotas')
    revalidatePath('/clientes')
    revalidatePath('/gastos')
    revalidatePath('/reportes')
    return { ok: true, data: res }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}
