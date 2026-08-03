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

export async function createCuentaDestino(input: {
  id_tenant: string
  nombre: string
  tipo: TipoCuentaDestino
  titular?: string | null
  identificador?: string | null
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
