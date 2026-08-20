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
  createCuentaDestino,
  setCuentaPredeterminada,
  updateCuentaDestino,
} from '@/lib/dal/ventas/cuenta-destino'
import {
  cerrarVigenciaArancel,
  createArancelCobro,
  updateArancelCobro,
} from '@/lib/dal/ventas/arancel'
import {
  spCobrarCuota,
  spMarcarCuotaIncobrable,
} from '@/lib/dal/cuotas/cuota'
import type { FormaPago } from '@/lib/types/precios'
import type {
  FinanciacionInput,
  MedioPago,
  PagoInput,
  ResultadoIncobrable,
  TipoComprobante,
  TipoCuentaDestino,
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

// ─── Cuentas destino ─────────────────────────────────────────────────

/**
 * Alta de cuenta con su costo de cobro en un solo paso. Separarlo obligaba a
 * crear la cuenta, buscarla en la tabla y volver a entrar para configurarla —
 * tres pantallas para una sola decisión, y una cuenta a medio configurar en
 * el medio.
 *
 * Los aranceles se cargan después de la cuenta porque la referencian. Si uno
 * falla, la cuenta YA quedó creada: se devuelve `ok` con `arancelesFallidos`
 * para avisarlo, en vez de dejar al usuario sin cuenta por un porcentaje mal
 * tipeado.
 */
export async function crearCuentaDestinoAction(input: {
  nombre: string
  tipo: TipoCuentaDestino
  titular?: string | null
  identificador?: string | null
  retenciones?: {
    ret_iva_pct: number
    ret_ganancias_pct: number
    ret_iibb_pct: number
    imp_deb_cred_pct: number
  }
  aranceles?: Array<{
    medio: MedioPago
    arancelPct: number
    ivaArancelPct: number
    diasAcreditacion: number
  }>
}): Promise<ActionResult<{ id: string; arancelesFallidos: number }>> {
  const g = await guarded('ventas', 'crear')
  if (!g.ok) return { ok: false, reason: g.error }
  if (input.nombre.trim().length < 2) return { ok: false, reason: 'nombre-invalido' }

  const ret = input.retenciones
  if (ret) {
    for (const pct of Object.values(ret)) {
      if (!porcentajeValido(pct)) return { ok: false, reason: 'porcentaje-invalido' }
    }
  }
  for (const a of input.aranceles ?? []) {
    if (!porcentajeValido(a.arancelPct) || !porcentajeValido(a.ivaArancelPct)) {
      return { ok: false, reason: 'porcentaje-invalido' }
    }
    if (a.diasAcreditacion < 0) return { ok: false, reason: 'dias-invalidos' }
  }

  try {
    const row = await createCuentaDestino({
      id_tenant: g.tenantId,
      nombre: input.nombre.trim(),
      tipo: input.tipo,
      titular: input.titular?.trim() || null,
      identificador: input.identificador?.trim() || null,
      ...(ret ?? {}),
    })

    let arancelesFallidos = 0
    for (const a of input.aranceles ?? []) {
      try {
        await createArancelCobro(g.tenantId, {
          id_cuenta_destino: row.id_cuenta_destino,
          medio: a.medio,
          // Comodín: aplica a cualquier plan. El tarifario por plan se afina
          // después, desde el panel de la cuenta.
          cuotas: null,
          arancel_pct: a.arancelPct,
          iva_arancel_pct: a.ivaArancelPct,
          dias_acreditacion: a.diasAcreditacion,
        })
      } catch {
        arancelesFallidos++
      }
    }

    revalidatePath('/ventas/cuentas')
    revalidatePath('/ventas/nueva')
    return { ok: true, data: { id: row.id_cuenta_destino, arancelesFallidos } }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function actualizarCuentaDestinoAction(input: {
  id: string
  patch: {
    nombre?: string
    tipo?: TipoCuentaDestino
    titular?: string | null
    identificador?: string | null
    activo?: boolean
    ret_iva_pct?: number
    ret_ganancias_pct?: number
    ret_iibb_pct?: number
    imp_deb_cred_pct?: number
  }
}): Promise<ActionResult> {
  const g = await guarded('ventas', 'editar')
  if (!g.ok) return { ok: false, reason: g.error }
  for (const pct of [
    input.patch.ret_iva_pct,
    input.patch.ret_ganancias_pct,
    input.patch.ret_iibb_pct,
    input.patch.imp_deb_cred_pct,
  ]) {
    if (pct !== undefined && !porcentajeValido(pct)) {
      return { ok: false, reason: 'porcentaje-invalido' }
    }
  }
  try {
    await updateCuentaDestino(input.id, input.patch)
    revalidatePath('/ventas/cuentas')
    revalidatePath('/ventas/nueva')
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

// ─── Aranceles de cobro (00057) ──────────────────────────────────────

/** Un porcentaje de arancel/retención: no negativo y no mayor a 100. */
function porcentajeValido(n: number): boolean {
  return Number.isFinite(n) && n >= 0 && n <= 100
}

export async function crearArancelCobroAction(input: {
  idCuentaDestino: string
  medio: MedioPago
  cuotas?: number | null
  arancelPct: number
  ivaArancelPct?: number
  diasAcreditacion?: number
  notas?: string | null
}): Promise<ActionResult<{ id: string }>> {
  const g = await guarded('ventas', 'crear')
  if (!g.ok) return { ok: false, reason: g.error }
  if (!porcentajeValido(input.arancelPct)) return { ok: false, reason: 'porcentaje-invalido' }
  if (input.ivaArancelPct !== undefined && !porcentajeValido(input.ivaArancelPct)) {
    return { ok: false, reason: 'porcentaje-invalido' }
  }
  if (input.diasAcreditacion !== undefined && input.diasAcreditacion < 0) {
    return { ok: false, reason: 'dias-invalidos' }
  }
  // El plan de cuotas sólo tiene sentido en crédito: en cualquier otro medio
  // haría que el lookup del tarifario no matchee nunca.
  if (input.cuotas != null && input.medio !== 'tarjeta_credito') {
    return { ok: false, reason: 'cuotas-medio-invalido' }
  }
  try {
    const row = await createArancelCobro(g.tenantId, {
      id_cuenta_destino: input.idCuentaDestino,
      medio: input.medio,
      cuotas: input.cuotas ?? null,
      arancel_pct: input.arancelPct,
      iva_arancel_pct: input.ivaArancelPct,
      dias_acreditacion: input.diasAcreditacion,
      notas: input.notas ?? null,
    })
    revalidatePath('/ventas/cuentas')
    revalidatePath('/ventas/nueva')
    return { ok: true, data: { id: row.id_arancel_cobro } }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function actualizarArancelCobroAction(input: {
  id: string
  patch: {
    arancel_pct?: number
    iva_arancel_pct?: number
    dias_acreditacion?: number
    notas?: string | null
  }
}): Promise<ActionResult> {
  const g = await guarded('ventas', 'editar')
  if (!g.ok) return { ok: false, reason: g.error }
  if (input.patch.arancel_pct !== undefined && !porcentajeValido(input.patch.arancel_pct)) {
    return { ok: false, reason: 'porcentaje-invalido' }
  }
  if (
    input.patch.iva_arancel_pct !== undefined &&
    !porcentajeValido(input.patch.iva_arancel_pct)
  ) {
    return { ok: false, reason: 'porcentaje-invalido' }
  }
  if (input.patch.dias_acreditacion !== undefined && input.patch.dias_acreditacion < 0) {
    return { ok: false, reason: 'dias-invalidos' }
  }
  try {
    await updateArancelCobro(input.id, input.patch)
    revalidatePath('/ventas/cuentas')
    revalidatePath('/ventas/nueva')
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function cerrarVigenciaArancelAction(input: {
  id: string
  hasta?: string
}): Promise<ActionResult> {
  const g = await guarded('ventas', 'editar')
  if (!g.ok) return { ok: false, reason: g.error }
  try {
    await cerrarVigenciaArancel(input.id, input.hasta ?? new Date().toISOString().slice(0, 10))
    revalidatePath('/ventas/cuentas')
    revalidatePath('/ventas/nueva')
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export async function marcarCuentaPredeterminadaAction(input: {
  id: string
}): Promise<ActionResult> {
  const g = await guarded('ventas', 'editar')
  if (!g.ok) return { ok: false, reason: g.error }
  try {
    await setCuentaPredeterminada(input.id)
    revalidatePath('/ventas/cuentas')
    revalidatePath('/ventas/nueva')
    return { ok: true }
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
