import 'server-only'
import { createServerClient } from '@/lib/dal/supabase'
import type {
  FormaPago,
  ProductoConPrecioStatus,
  SnapshotPrecio,
} from '@/lib/types/precios'

/**
 * Snapshot de precio para una venta futura. RPC `sp_calcular_precio_venta_snapshot`
 * hace toda la cascada + suma de descuentos + recargo por forma de pago.
 * NO persiste — solo calcula. Etapa 5 (venta) usa este resultado para
 * guardar `detalle_venta.precio_venta`.
 */
export async function calcularSnapshotPrecio(input: {
  idProducto: string
  formaPago?: FormaPago
}): Promise<SnapshotPrecio> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('sp_calcular_precio_venta_snapshot', {
    p_id_producto: input.idProducto,
    p_forma_pago: input.formaPago ?? 'efectivo',
  })
  if (error) throw new Error(`sp_calcular_precio_venta_snapshot: ${error.message}`)
  return data as SnapshotPrecio
}

/**
 * Recalcula (persiste) `precio_venta` de UN producto aplicando la regla
 * de margen resuelta contra el costo vigente. Devuelve el nuevo precio
 * o null si no hay costo vigente.
 */
export async function spRecalcularPrecioVenta(idProducto: string): Promise<number | null> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('sp_recalcular_precio_venta', {
    p_id_producto: idProducto,
  })
  if (error) throw new Error(`sp_recalcular_precio_venta: ${error.message}`)
  return data === null ? null : Number(data)
}

/**
 * Aplica sp_recalcular_precio_venta a múltiples productos en serie.
 * Devuelve mapa id → precio nuevo (null si no se pudo). Sin paralelismo:
 * queremos audit ordenado y RLS por-request estable.
 */
export async function spRecalcularBatch(ids: string[]): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {}
  for (const id of ids) {
    try {
      out[id] = await spRecalcularPrecioVenta(id)
    } catch {
      out[id] = null
    }
  }
  return out
}

/**
 * Vista "Control de precios": listado de productos activos con costo,
 * precio actual, regla de margen aplicable, y precio proyectado (preview
 * de qué pasaría si se recalcula ahora).
 *
 * Estrategia: 1 query de productos + 1 query de costos vigentes + 1 query
 * de reglas de margen relevantes; resolver en memoria en TS (más simple
 * que una CTE gigante y suficiente para volúmenes de un tenant de retail).
 */
export async function listControlDePrecios(): Promise<ProductoConPrecioStatus[]> {
  const supabase = await createServerClient()

  const { data: productos, error: e1 } = await supabase
    .from('producto')
    .select(`
      id_producto, id_categoria, nombre, sku, activo,
      precio_venta, precio_venta_resuelto_at, precio_venta_desactualizado,
      id_regla_margen_aplicada,
      categoria:categoria(id_categoria, nombre)
    `)
    .eq('activo', true)
    .order('nombre', { ascending: true })
  if (e1) throw new Error(`listControlDePrecios prod: ${e1.message}`)

  // Supabase's generated TS shape treats FK joins as arrays by default;
  // in practice `categoria` is a single object (one categoria per producto).
  // Route through `unknown` to opt out of the wider inferred shape.
  const rows = (productos ?? []) as unknown as Array<{
    id_producto: string
    id_categoria: string
    nombre: string
    sku: string | null
    precio_venta: number | null
    precio_venta_resuelto_at: string | null
    precio_venta_desactualizado: boolean
    id_regla_margen_aplicada: string | null
    categoria: { id_categoria: string; nombre: string } | null
  }>
  if (rows.length === 0) return []

  const ids = rows.map((r) => r.id_producto)

  // Costos vigentes en un solo query.
  const { data: costos, error: e2 } = await supabase
    .from('costo_producto')
    .select('id_producto, costo')
    .in('id_producto', ids)
    .is('vigente_hasta', null)
  if (e2) throw new Error(`listControlDePrecios costos: ${e2.message}`)
  const costoMap = new Map<string, number>()
  for (const c of costos ?? []) costoMap.set(c.id_producto as string, Number(c.costo))

  // Reglas de margen aplicadas (nombre) — para mostrar cuál.
  const reglasIds = rows.map((r) => r.id_regla_margen_aplicada).filter(Boolean) as string[]
  const reglaNombreMap = new Map<string, string>()
  if (reglasIds.length > 0) {
    const { data: reglas } = await supabase
      .from('regla_precio')
      .select('id_regla, nombre')
      .in('id_regla', reglasIds)
    for (const r of reglas ?? []) {
      reglaNombreMap.set(r.id_regla as string, r.nombre as string)
    }
  }

  // Proyección: llamamos al resolver_regla_margen por producto (una RPC
  // por producto es cara si hay 5000 productos; para retail chico va).
  // Optimización futura: mover a una vista SQL o materializar en batch.
  const proyecciones: Array<{ id: string; precio_proyectado: number | null }> = []
  for (const r of rows) {
    const costo = costoMap.get(r.id_producto) ?? null
    if (costo == null) {
      proyecciones.push({ id: r.id_producto, precio_proyectado: null })
      continue
    }
    const { data: regla } = await supabase.rpc('resolver_regla_margen', {
      p_id_producto: r.id_producto,
    })
    // resolver_regla_margen retorna un regla_precio row o null.
    const reglaRow = (regla ?? null) as
      | { tipo_valor: 'porcentaje' | 'monto_fijo'; valor: number }
      | null
    let proyectado: number
    if (!reglaRow || reglaRow.valor == null) {
      proyectado = costo
    } else if (reglaRow.tipo_valor === 'porcentaje') {
      proyectado = costo * (1 + Number(reglaRow.valor))
    } else {
      proyectado = costo + Number(reglaRow.valor)
    }
    proyecciones.push({ id: r.id_producto, precio_proyectado: Number(proyectado.toFixed(2)) })
  }
  const proyMap = new Map(proyecciones.map((p) => [p.id, p.precio_proyectado]))

  return rows.map((r) => {
    const costo = costoMap.get(r.id_producto) ?? null
    const proyectado = proyMap.get(r.id_producto) ?? null
    const diferencia_pct =
      r.precio_venta != null && proyectado != null && r.precio_venta > 0
        ? Number((((proyectado - r.precio_venta) / r.precio_venta) * 100).toFixed(2))
        : null
    return {
      id_producto: r.id_producto,
      nombre: r.nombre,
      sku: r.sku,
      categoria_nombre: r.categoria?.nombre ?? null,
      costo_vigente: costo,
      precio_venta: r.precio_venta,
      precio_venta_resuelto_at: r.precio_venta_resuelto_at,
      precio_venta_desactualizado: r.precio_venta_desactualizado,
      regla_margen_nombre:
        r.id_regla_margen_aplicada != null
          ? reglaNombreMap.get(r.id_regla_margen_aplicada) ?? null
          : null,
      precio_proyectado: proyectado,
      diferencia_pct,
    }
  })
}
