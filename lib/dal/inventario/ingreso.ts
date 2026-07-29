import 'server-only'
import { createServerClient } from '@/lib/dal/supabase'
import type {
  IngresoConResumen,
  IngresoMercaderiaDetalleRow,
  IngresoMercaderiaInsert,
  IngresoMercaderiaRow,
  ProveedorRow,
  TipoIngreso,
} from '@/lib/types/inventario'

/**
 * Listado de ingresos con resumen agregado (proveedor + totales).
 * Ordenado por fecha desc. Query única: cabecera + join proveedor +
 * aggregation de detalle en memoria (cantidad y costo).
 */
export async function listIngresosConResumen(): Promise<IngresoConResumen[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('ingreso_mercaderia')
    .select(`
      *,
      proveedor:proveedor(id_proveedor, nombre),
      detalle:ingreso_mercaderia_detalle(cantidad, costo_unitario)
    `)
    .order('fecha', { ascending: false })
  if (error) throw new Error(`listIngresosConResumen: ${error.message}`)

  return ((data ?? []) as Array<
    IngresoMercaderiaRow & {
      proveedor: Pick<ProveedorRow, 'id_proveedor' | 'nombre'> | null
      detalle: Array<{ cantidad: number; costo_unitario: number }>
    }
  >).map((row) => {
    const detalle = row.detalle ?? []
    const total_cantidad = detalle.reduce((acc, d) => acc + Number(d.cantidad), 0)
    const total_costo = detalle.reduce(
      (acc, d) => acc + Number(d.cantidad) * Number(d.costo_unitario),
      0,
    )
    const { detalle: _drop, ...rest } = row
    void _drop
    return {
      ...rest,
      total_lineas: detalle.length,
      total_cantidad,
      total_costo,
    }
  })
}

export async function getIngreso(id: string): Promise<
  | (IngresoMercaderiaRow & {
      proveedor: Pick<ProveedorRow, 'id_proveedor' | 'nombre' | 'telefono'> | null
      detalle: IngresoMercaderiaDetalleRow[]
    })
  | null
> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('ingreso_mercaderia')
    .select(`
      *,
      proveedor:proveedor(id_proveedor, nombre, telefono),
      detalle:ingreso_mercaderia_detalle(*)
    `)
    .eq('id_ingreso', id)
    .maybeSingle()
  if (error) throw new Error(`getIngreso: ${error.message}`)
  if (!data) return null
  return data as unknown as Awaited<ReturnType<typeof getIngreso>>
}

/**
 * Crea un ingreso "borrador" (confirmado=false) sin líneas todavía.
 * Devuelve el id_ingreso. Las líneas se agregan con `addIngresoDetalle`.
 * La confirmación (que genera los items físicos) usa `spConfirmarIngreso`.
 */
export async function createIngresoBorrador(input: {
  tenantId: string
  idProveedor: string
  tipoIngreso: TipoIngreso
  numeroRemito?: string | null
  observaciones?: string | null
  pdfUrl?: string | null
  idUsuarioAlta?: string | null
}): Promise<string> {
  const supabase = await createServerClient()
  const payload: IngresoMercaderiaInsert = {
    id_tenant: input.tenantId,
    id_proveedor: input.idProveedor,
    tipo_ingreso: input.tipoIngreso,
    numero_remito: input.numeroRemito ?? null,
    observaciones: input.observaciones ?? null,
    pdf_url: input.pdfUrl ?? null,
    id_usuario_alta: input.idUsuarioAlta ?? null,
  }
  const { data, error } = await supabase
    .from('ingreso_mercaderia').insert(payload).select('id_ingreso').single()
  if (error) throw new Error(`createIngresoBorrador: ${error.message}`)
  return (data as { id_ingreso: string }).id_ingreso
}

export async function addIngresoDetalle(input: {
  tenantId: string
  idIngreso: string
  idProducto: string
  cantidad: number
  costoUnitario: number
}): Promise<string> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('ingreso_mercaderia_detalle')
    .insert({
      id_tenant: input.tenantId,
      id_ingreso: input.idIngreso,
      id_producto: input.idProducto,
      cantidad: input.cantidad,
      costo_unitario: input.costoUnitario,
    })
    .select('id_detalle')
    .single()
  if (error) throw new Error(`addIngresoDetalle: ${error.message}`)
  return (data as { id_detalle: string }).id_detalle
}

export async function removeIngresoDetalle(idDetalle: string): Promise<void> {
  const supabase = await createServerClient()
  const { error } = await supabase
    .from('ingreso_mercaderia_detalle').delete().eq('id_detalle', idDetalle)
  if (error) throw new Error(`removeIngresoDetalle: ${error.message}`)
}

/**
 * Confirma el ingreso: genera N item_producto (uno por unidad de cada línea),
 * cada uno con QR único (hex 24 chars). Devuelve la cantidad de items generados.
 * Idempotente: si ya está confirmado, devuelve 0.
 */
export async function spConfirmarIngreso(idIngreso: string): Promise<number> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('sp_confirmar_ingreso', {
    p_id_ingreso: idIngreso,
  })
  if (error) throw new Error(`sp_confirmar_ingreso: ${error.message}`)
  return Number(data ?? 0)
}
