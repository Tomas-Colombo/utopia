import 'server-only'
import { createServerClient } from '@/lib/dal/supabase'
import type {
  CategoriaGastoRow,
  CategoriaGastoStatus,
  GastoConCategoria,
} from '@/lib/types/rendiciones'

export async function listCategoriasGasto(opts?: {
  soloActivas?: boolean
}): Promise<CategoriaGastoRow[]> {
  const supabase = await createServerClient()
  let q = supabase.from('categoria_gasto').select('*').order('nombre', { ascending: true })
  if (opts?.soloActivas) q = q.eq('activa', true)
  const { data, error } = await q
  if (error) throw new Error(`listCategoriasGasto: ${error.message}`)
  return (data ?? []) as CategoriaGastoRow[]
}

export async function listGastos(opts?: {
  desde?: string
  hasta?: string
  idCategoria?: string
  limit?: number
}): Promise<GastoConCategoria[]> {
  const supabase = await createServerClient()
  let q = supabase
    .from('gasto_negocio')
    .select(`
      *,
      categoria:categoria_gasto(id_categoria_gasto, nombre)
    `)
    .order('fecha', { ascending: false })
    .limit(opts?.limit ?? 200)
  if (opts?.desde) q = q.gte('fecha', opts.desde)
  if (opts?.hasta) q = q.lte('fecha', opts.hasta)
  if (opts?.idCategoria) q = q.eq('id_categoria_gasto', opts.idCategoria)
  const { data, error } = await q
  if (error) throw new Error(`listGastos: ${error.message}`)
  return (data ?? []) as unknown as GastoConCategoria[]
}

/**
 * RF-10: presupuesto vs gastado del mes calendario en curso, por categoría.
 * Se hacen 2 queries y se agregan en memoria. Volumen chico por tenant.
 */
export async function listPresupuestoMes(): Promise<CategoriaGastoStatus[]> {
  const supabase = await createServerClient()
  const inicioMes = new Date()
  inicioMes.setDate(1)
  inicioMes.setHours(0, 0, 0, 0)

  const { data: cats, error: cErr } = await supabase
    .from('categoria_gasto')
    .select('id_categoria_gasto, nombre, presupuesto_mensual')
    .eq('activa', true)
    .order('nombre', { ascending: true })
  if (cErr) throw new Error(`listPresupuestoMes cats: ${cErr.message}`)

  const rows = (cats ?? []) as Array<{
    id_categoria_gasto: string
    nombre: string
    presupuesto_mensual: number | null
  }>
  if (rows.length === 0) return []

  const { data: gastos, error: gErr } = await supabase
    .from('gasto_negocio')
    .select('id_categoria_gasto, monto')
    .gte('fecha', inicioMes.toISOString())
  if (gErr) throw new Error(`listPresupuestoMes gastos: ${gErr.message}`)

  const acum = new Map<string, number>()
  for (const g of gastos ?? []) {
    const k = g.id_categoria_gasto as string
    acum.set(k, (acum.get(k) ?? 0) + Number(g.monto))
  }

  return rows.map((c) => {
    const gastado = acum.get(c.id_categoria_gasto) ?? 0
    const presupuesto = c.presupuesto_mensual == null ? null : Number(c.presupuesto_mensual)
    if (presupuesto == null) {
      return {
        id_categoria_gasto: c.id_categoria_gasto,
        nombre: c.nombre,
        presupuesto_mensual: null,
        gastado_mes: Number(gastado.toFixed(2)),
        gastado_pct: null,
        restante: null,
        sin_control: true,
        alerta: 'sin_control' as const,
      }
    }
    const pct = presupuesto === 0 ? (gastado > 0 ? 999 : 0) : (gastado / presupuesto) * 100
    const restante = presupuesto - gastado
    const alerta: CategoriaGastoStatus['alerta'] =
      pct >= 100 ? 'excedido' : pct >= 80 ? 'cerca' : 'ok'
    return {
      id_categoria_gasto: c.id_categoria_gasto,
      nombre: c.nombre,
      presupuesto_mensual: presupuesto,
      gastado_mes: Number(gastado.toFixed(2)),
      gastado_pct: Number(pct.toFixed(1)),
      restante: Number(restante.toFixed(2)),
      sin_control: false,
      alerta,
    }
  })
}

// ─── RPCs ────────────────────────────────────────────────────────────

export async function spRegistrarGasto(input: {
  idCategoriaGasto: string
  monto: number
  descripcion: string
  fecha?: string | null
  comprobanteRef?: string | null
}): Promise<string> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('sp_registrar_gasto', {
    p_id_categoria_gasto: input.idCategoriaGasto,
    p_monto: input.monto,
    p_descripcion: input.descripcion,
    p_fecha: input.fecha ?? null,
    p_comprobante_ref: input.comprobanteRef ?? null,
  })
  if (error) throw new Error(`sp_registrar_gasto: ${error.message}`)
  return data as string
}

export async function spSetPresupuesto(input: {
  idCategoria: string
  presupuesto: number | null
}): Promise<void> {
  const supabase = await createServerClient()
  const { error } = await supabase.rpc('sp_set_presupuesto_categoria_gasto', {
    p_id_categoria: input.idCategoria,
    p_presupuesto: input.presupuesto,
  })
  if (error) throw new Error(`sp_set_presupuesto_categoria_gasto: ${error.message}`)
}
