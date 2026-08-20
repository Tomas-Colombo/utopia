import 'server-only'
import { createServerClient } from '@/lib/dal/supabase'
import type { CuentaDestinoRow, TipoCuentaDestino } from '@/lib/types/ventas'

/**
 * Cuentas donde entra la plata de las ventas (00047): la caja del local, una
 * cuenta bancaria, una billetera virtual.
 *
 * No hay SP: el CRUD va directo por PostgREST bajo la política RLS del tenant,
 * como el resto de las tablas de configuración.
 */
export async function listCuentasDestino(opts?: {
  soloActivas?: boolean
}): Promise<CuentaDestinoRow[]> {
  const supabase = await createServerClient()
  let q = supabase
    .from('cuenta_destino')
    .select('*')
    .order('es_predeterminada', { ascending: false })
    .order('nombre', { ascending: true })
  if (opts?.soloActivas) q = q.eq('activo', true)
  const { data, error } = await q
  if (error) throw new Error(`listCuentasDestino: ${error.message}`)
  return (data ?? []) as CuentaDestinoRow[]
}

/**
 * Página del listado con `total`, para el pager de `/ventas/cuentas`.
 * Mismo contrato que `listVentasPaginado`: el orden lo fija el server para
 * que la predeterminada quede siempre visible arriba de todo.
 */
export async function listCuentasDestinoPaginado(opts: {
  page: number
  pageSize: number
  soloActivas?: boolean
}): Promise<{ rows: CuentaDestinoRow[]; total: number }> {
  const supabase = await createServerClient()
  const from = (Math.max(1, opts.page) - 1) * opts.pageSize
  const to = from + opts.pageSize - 1

  let q = supabase
    .from('cuenta_destino')
    .select('*', { count: 'exact' })
    .order('es_predeterminada', { ascending: false })
    .order('nombre', { ascending: true })
    .range(from, to)
  if (opts.soloActivas) q = q.eq('activo', true)

  const { data, count, error } = await q
  if (error) throw new Error(`listCuentasDestinoPaginado: ${error.message}`)
  return { rows: (data ?? []) as CuentaDestinoRow[], total: count ?? 0 }
}

export async function createCuentaDestino(input: {
  id_tenant: string
  nombre: string
  tipo: TipoCuentaDestino
  titular?: string | null
  identificador?: string | null
  // Retenciones (00057). Opcionales: la DB las deja en 0.
  ret_iva_pct?: number
  ret_ganancias_pct?: number
  ret_iibb_pct?: number
  imp_deb_cred_pct?: number
}): Promise<CuentaDestinoRow> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('cuenta_destino')
    .insert({
      id_tenant: input.id_tenant,
      nombre: input.nombre,
      tipo: input.tipo,
      titular: input.titular ?? null,
      identificador: input.identificador ?? null,
      ret_iva_pct: input.ret_iva_pct ?? 0,
      ret_ganancias_pct: input.ret_ganancias_pct ?? 0,
      ret_iibb_pct: input.ret_iibb_pct ?? 0,
      imp_deb_cred_pct: input.imp_deb_cred_pct ?? 0,
    })
    .select('*')
    .single()
  if (error) throw new Error(`createCuentaDestino: ${error.message}`)
  return data as CuentaDestinoRow
}

export async function updateCuentaDestino(
  id: string,
  patch: {
    nombre?: string
    tipo?: TipoCuentaDestino
    titular?: string | null
    identificador?: string | null
    activo?: boolean
    // Retenciones (00057). Van en la cuenta y no en el tarifario porque
    // dependen de la situación fiscal del comercio, no del plan de cuotas.
    ret_iva_pct?: number
    ret_ganancias_pct?: number
    ret_iibb_pct?: number
    imp_deb_cred_pct?: number
  },
): Promise<void> {
  const supabase = await createServerClient()
  const { error } = await supabase
    .from('cuenta_destino')
    .update(patch)
    .eq('id_cuenta_destino', id)
  if (error) throw new Error(`updateCuentaDestino: ${error.message}`)
}

/**
 * Marca UNA cuenta como predeterminada. Hay un unique index parcial por tenant
 * (00047), así que primero se baja la anterior: si se hiciera al revés, el
 * update choca contra el índice.
 */
export async function setCuentaPredeterminada(id: string): Promise<void> {
  const supabase = await createServerClient()
  const { error: eClear } = await supabase
    .from('cuenta_destino')
    .update({ es_predeterminada: false })
    .eq('es_predeterminada', true)
    .neq('id_cuenta_destino', id)
  if (eClear) throw new Error(`setCuentaPredeterminada (clear): ${eClear.message}`)

  const { error } = await supabase
    .from('cuenta_destino')
    .update({ es_predeterminada: true, activo: true })
    .eq('id_cuenta_destino', id)
  if (error) throw new Error(`setCuentaPredeterminada: ${error.message}`)
}
