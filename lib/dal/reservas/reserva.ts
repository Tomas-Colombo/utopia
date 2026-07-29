import 'server-only'
import { createServerClient } from '@/lib/dal/supabase'
import type { EstadoReserva, ReservaConDetalle, ReservaRow } from '@/lib/types/ventas'

export async function listReservas(opts?: {
  estado?: EstadoReserva
}): Promise<Array<ReservaRow & { cliente: { id_cliente: string; nombre: string } | null; items_count: number }>> {
  const supabase = await createServerClient()
  let q = supabase
    .from('reserva')
    .select(`
      *,
      cliente:cliente(id_cliente, nombre),
      lineas:detalle_reserva(id_detalle_reserva)
    `)
    .order('fecha', { ascending: false })
  if (opts?.estado) q = q.eq('estado_reserva', opts.estado)
  const { data, error } = await q
  if (error) throw new Error(`listReservas: ${error.message}`)
  return ((data ?? []) as unknown as Array<
    ReservaRow & {
      cliente: { id_cliente: string; nombre: string } | null
      lineas: Array<{ id_detalle_reserva: string }>
    }
  >).map((r) => {
    const { lineas, ...rest } = r
    return { ...rest, items_count: lineas?.length ?? 0 }
  })
}

export async function getReservaConDetalle(id: string): Promise<ReservaConDetalle | null> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('reserva')
    .select(`
      *,
      cliente:cliente(id_cliente, nombre, telefono),
      lineas:detalle_reserva(
        *,
        producto:producto(id_producto, nombre, sku),
        item:item_producto(qr_code, estado_item)
      )
    `)
    .eq('id_reserva', id)
    .maybeSingle()
  if (error) throw new Error(`getReservaConDetalle: ${error.message}`)
  return (data ?? null) as unknown as ReservaConDetalle | null
}

export async function listReservasPorCliente(idCliente: string): Promise<ReservaRow[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('reserva').select('*').eq('id_cliente', idCliente)
    .order('fecha', { ascending: false })
  if (error) throw new Error(`listReservasPorCliente: ${error.message}`)
  return (data ?? []) as ReservaRow[]
}

export async function spCrearReserva(input: {
  idCliente: string | null
  items: string[]
  fechaVencimiento: string
  observaciones?: string | null
}): Promise<string> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('sp_crear_reserva', {
    p_id_cliente: input.idCliente,
    p_items: input.items,
    p_fecha_vencimiento: input.fechaVencimiento,
    p_observaciones: input.observaciones ?? null,
  })
  if (error) throw new Error(`sp_crear_reserva: ${error.message}`)
  return data as string
}

export async function spCancelarReserva(idReserva: string, motivo?: string): Promise<void> {
  const supabase = await createServerClient()
  const { error } = await supabase.rpc('sp_cancelar_reserva', {
    p_id_reserva: idReserva,
    p_motivo: motivo ?? null,
  })
  if (error) throw new Error(`sp_cancelar_reserva: ${error.message}`)
}

export async function spVencerReservas(): Promise<number> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('sp_vencer_reservas')
  if (error) throw new Error(`sp_vencer_reservas: ${error.message}`)
  return Number(data ?? 0)
}
