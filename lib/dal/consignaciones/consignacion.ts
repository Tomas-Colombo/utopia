import 'server-only'
import { createServerClient } from '@/lib/dal/supabase'
import type {
  ConsignacionConDetalle,
  ConsignacionConResumen,
  ConsignacionRow,
  EstadoConsignacion,
} from '@/lib/types/consignaciones'

export async function listConsignaciones(opts?: {
  estado?: EstadoConsignacion
  idProveedor?: string
}): Promise<ConsignacionConResumen[]> {
  const supabase = await createServerClient()
  let q = supabase
    .from('consignacion')
    .select(`
      *,
      proveedor:proveedor(id_proveedor, nombre, telefono),
      detalles:consignacion_detalle(estado)
    `)
    .order('fecha', { ascending: false })
  if (opts?.estado) q = q.eq('estado', opts.estado)
  if (opts?.idProveedor) q = q.eq('id_proveedor', opts.idProveedor)
  const { data, error } = await q
  if (error) throw new Error(`listConsignaciones: ${error.message}`)

  return ((data ?? []) as unknown as Array<
    ConsignacionRow & {
      proveedor: ConsignacionConResumen['proveedor']
      detalles: Array<{ estado: 'pendiente' | 'devuelto' | 'cancelado' }>
    }
  >).map((row) => {
    const detalles = row.detalles ?? []
    const pendientes = detalles.filter((d) => d.estado === 'pendiente').length
    const devueltos = detalles.filter((d) => d.estado === 'devuelto').length
    const cancelados = detalles.filter((d) => d.estado === 'cancelado').length
    const { detalles: _drop, ...rest } = row
    void _drop
    return {
      ...rest,
      total_items: detalles.length,
      pendientes,
      devueltos,
      cancelados,
    }
  })
}

export async function getConsignacionConDetalle(
  id: string,
): Promise<ConsignacionConDetalle | null> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('consignacion')
    .select(`
      *,
      proveedor:proveedor(id_proveedor, nombre, telefono),
      detalles:consignacion_detalle(
        *,
        producto:producto(id_producto, nombre, sku),
        item:item_producto(qr_code, estado_item, costo_ingreso)
      )
    `)
    .eq('id_consignacion', id)
    .maybeSingle()
  if (error) throw new Error(`getConsignacionConDetalle: ${error.message}`)
  return (data ?? null) as unknown as ConsignacionConDetalle | null
}

// ─── RPCs ────────────────────────────────────────────────────────────

export async function spCrearConsignacion(input: {
  idProveedor: string
  observaciones?: string | null
}): Promise<string> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('sp_crear_consignacion', {
    p_id_proveedor: input.idProveedor,
    p_observaciones: input.observaciones ?? null,
  })
  if (error) throw new Error(`sp_crear_consignacion: ${error.message}`)
  return data as string
}

export async function spAgregarItemConsignacion(input: {
  idConsignacion: string
  idItem: string
  motivo?: string | null
}): Promise<string> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('sp_agregar_item_consignacion', {
    p_id_consignacion: input.idConsignacion,
    p_id_item: input.idItem,
    p_motivo: input.motivo ?? null,
  })
  if (error) throw new Error(`sp_agregar_item_consignacion: ${error.message}`)
  return data as string
}

export async function spCancelarItemConsignacion(
  idDetalle: string,
  motivo?: string,
): Promise<void> {
  const supabase = await createServerClient()
  const { error } = await supabase.rpc('sp_cancelar_item_consignacion', {
    p_id_detalle: idDetalle,
    p_motivo: motivo ?? null,
  })
  if (error) throw new Error(`sp_cancelar_item_consignacion: ${error.message}`)
}

export async function spConfirmarSalidaItem(idDetalle: string): Promise<void> {
  const supabase = await createServerClient()
  const { error } = await supabase.rpc('sp_confirmar_salida_item', {
    p_id_detalle: idDetalle,
  })
  if (error) throw new Error(`sp_confirmar_salida_item: ${error.message}`)
}

export async function spCerrarConsignacion(idConsignacion: string): Promise<void> {
  const supabase = await createServerClient()
  const { error } = await supabase.rpc('sp_cerrar_consignacion', {
    p_id_consignacion: idConsignacion,
  })
  if (error) throw new Error(`sp_cerrar_consignacion: ${error.message}`)
}

export async function spRegistrarAjusteInventario(input: {
  idItem: string
  cantidadSistema: number
  cantidadContada: number
  observaciones: string
  darDeBaja?: boolean
}): Promise<string> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('sp_registrar_ajuste_inventario', {
    p_id_item: input.idItem,
    p_cantidad_sistema: input.cantidadSistema,
    p_cantidad_contada: input.cantidadContada,
    p_observaciones: input.observaciones,
    p_dar_de_baja: input.darDeBaja ?? false,
  })
  if (error) throw new Error(`sp_registrar_ajuste_inventario: ${error.message}`)
  return data as string
}
