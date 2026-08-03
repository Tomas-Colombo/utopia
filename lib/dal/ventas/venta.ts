import 'server-only'
import { createServerClient } from '@/lib/dal/supabase'
import type { FormaPago } from '@/lib/types/precios'
import type {
  RegistrarVentaInput,
  VentaConDetalle,
  VentaRow,
} from '@/lib/types/ventas'

export async function listVentas(opts?: {
  /** Instante inicial INCLUSIVO (ISO). Usar `inicioDelDia()` de `lib/fechas`. */
  desde?: string
  /**
   * Instante final EXCLUSIVO (ISO). Exclusivo a propósito: `fecha` es
   * `timestamptz` (00021), así que un tope inclusivo con un día sin hora
   * (`<= '2026-08-31'`) se resuelve como `<= 2026-08-31T00:00:00` y deja
   * afuera TODAS las ventas de ese día. Usar `inicioDelDiaSiguiente()`.
   */
  hastaExclusivo?: string
  limit?: number
}): Promise<Array<VentaRow & { cliente: { id_cliente: string; nombre: string } | null; lineas_count: number }>> {
  const supabase = await createServerClient()
  let q = supabase
    .from('venta')
    .select(`
      *,
      cliente:cliente(id_cliente, nombre),
      lineas:detalle_venta(id_detalle_venta)
    `)
    .order('fecha', { ascending: false })
    .limit(opts?.limit ?? 100)
  if (opts?.desde) q = q.gte('fecha', opts.desde)
  if (opts?.hastaExclusivo) q = q.lt('fecha', opts.hastaExclusivo)
  const { data, error } = await q
  if (error) throw new Error(`listVentas: ${error.message}`)
  return ((data ?? []) as unknown as Array<
    VentaRow & {
      cliente: { id_cliente: string; nombre: string } | null
      lineas: Array<{ id_detalle_venta: string }>
    }
  >).map((r) => {
    const { lineas, ...rest } = r
    return { ...rest, lineas_count: lineas?.length ?? 0 }
  })
}

export async function getVentaConDetalle(id: string): Promise<VentaConDetalle | null> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('venta')
    .select(`
      *,
      cliente:cliente(id_cliente, nombre, telefono),
      lineas:detalle_venta(
        *,
        producto:producto(id_producto, nombre, sku),
        item:item_producto(qr_code)
      ),
      comprobantes:comprobante(*)
    `)
    .eq('id_venta', id)
    .maybeSingle()
  if (error) throw new Error(`getVentaConDetalle: ${error.message}`)
  return (data ?? null) as unknown as VentaConDetalle | null
}

/**
 * Llama al RPC transaccional. Devuelve id_venta.
 * Errores del RPC se propagan tal cual (message = código semántico:
 * 'item-no-disponible', 'item-en-reserva', etc.).
 */
export async function spRegistrarVenta(input: RegistrarVentaInput): Promise<string> {
  if (input.lineas.length === 0) throw new Error('lineas-vacias')
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('sp_registrar_venta', {
    p_lineas: input.lineas.map((l) => ({
      id_item: l.id_item,
      descuentos: l.descuentos ?? [],
    })) as unknown as object,
    p_forma_pago: input.forma_pago,
    p_id_cliente: input.id_cliente ?? null,
    p_id_reserva: input.id_reserva ?? null,
    p_observaciones: input.observaciones ?? null,
  })
  if (error) throw new Error(`sp_registrar_venta: ${error.message}`)
  return data as string
}

export async function spAnularVenta(idVenta: string, motivo?: string): Promise<void> {
  const supabase = await createServerClient()
  const { error } = await supabase.rpc('sp_anular_venta', {
    p_id_venta: idVenta,
    p_motivo: motivo ?? null,
  })
  if (error) throw new Error(`sp_anular_venta: ${error.message}`)
}

export async function spRegistrarDevolucionCliente(
  idDetalleVenta: string,
  motivo?: string,
): Promise<void> {
  const supabase = await createServerClient()
  const { error } = await supabase.rpc('sp_registrar_devolucion_cliente', {
    p_id_detalle_venta: idDetalleVenta,
    p_motivo: motivo ?? null,
  })
  if (error) throw new Error(`sp_registrar_devolucion_cliente: ${error.message}`)
}

/**
 * Historial de compras de un cliente (útil para pantalla /clientes/[id]).
 */
export async function listVentasPorCliente(
  idCliente: string,
): Promise<VentaRow[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('venta')
    .select('*')
    .eq('id_cliente', idCliente)
    .order('fecha', { ascending: false })
  if (error) throw new Error(`listVentasPorCliente: ${error.message}`)
  return (data ?? []) as VentaRow[]
}

// Re-export types used by consumers
export type { FormaPago }
