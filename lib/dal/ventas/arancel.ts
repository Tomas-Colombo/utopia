import 'server-only'
import { createServerClient } from '@/lib/dal/supabase'
import type { ArancelCobroInsert, ArancelCobroRow, MedioPago } from '@/lib/types/ventas'

/**
 * Tarifario de cobro (00057): cuánto retiene el procesador por cada
 * combinación de cuenta, medio y plan de cuotas.
 *
 * Sin SP: CRUD directo por PostgREST bajo la política RLS del tenant, como el
 * resto de las tablas de configuración (ver `cuenta-destino.ts`).
 *
 * Los aranceles NO se borran: se cierra la vigencia. Saber qué se cobraba
 * cuándo es lo único que permite explicar el neto de una venta vieja.
 */
export async function listArancelesCobro(opts?: {
  idCuentaDestino?: string
  /** Por defecto sólo los vigentes (sin `vigente_hasta`). */
  incluirCerrados?: boolean
}): Promise<ArancelCobroRow[]> {
  const supabase = await createServerClient()
  let q = supabase
    .from('arancel_cobro')
    .select('*')
    .order('medio', { ascending: true })
    // Los comodines (cuotas null) al final: el específico es el que se lee
    // primero, igual que la precedencia con la que se resuelven.
    .order('cuotas', { ascending: true, nullsFirst: false })
  if (opts?.idCuentaDestino) q = q.eq('id_cuenta_destino', opts.idCuentaDestino)
  if (!opts?.incluirCerrados) q = q.is('vigente_hasta', null)

  const { data, error } = await q
  if (error) throw new Error(`listArancelesCobro: ${error.message}`)
  return (data ?? []) as ArancelCobroRow[]
}

export async function createArancelCobro(
  idTenant: string,
  input: ArancelCobroInsert,
): Promise<ArancelCobroRow> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('arancel_cobro')
    .insert({
      id_tenant: idTenant,
      id_cuenta_destino: input.id_cuenta_destino,
      medio: input.medio,
      cuotas: input.cuotas ?? null,
      arancel_pct: input.arancel_pct,
      iva_arancel_pct: input.iva_arancel_pct ?? 21,
      dias_acreditacion: input.dias_acreditacion ?? 0,
      vigente_desde: input.vigente_desde ?? undefined,
      notas: input.notas ?? null,
    })
    .select('*')
    .single()
  if (error) throw new Error(`createArancelCobro: ${error.message}`)
  return data as ArancelCobroRow
}

/**
 * Corrección de una fila mal cargada. Para un cambio REAL de arancel usar
 * `cerrarVigenciaArancel` + alta nueva: editar en el lugar reescribe la
 * historia y hace que un neto viejo deje de poder explicarse.
 */
export async function updateArancelCobro(
  id: string,
  patch: {
    arancel_pct?: number
    iva_arancel_pct?: number
    dias_acreditacion?: number
    notas?: string | null
  },
): Promise<void> {
  const supabase = await createServerClient()
  const { error } = await supabase
    .from('arancel_cobro')
    .update(patch)
    .eq('id_arancel_cobro', id)
  if (error) throw new Error(`updateArancelCobro: ${error.message}`)
}

/**
 * Cierra la vigencia de un tarifario. El unique index parcial de 00057 sólo
 * mira las filas con `vigente_hasta is null`, así que después de esto se
 * puede dar de alta el reemplazo sin chocar.
 */
export async function cerrarVigenciaArancel(id: string, hasta: string): Promise<void> {
  const supabase = await createServerClient()
  const { error } = await supabase
    .from('arancel_cobro')
    .update({ vigente_hasta: hasta })
    .eq('id_arancel_cobro', id)
  if (error) throw new Error(`cerrarVigenciaArancel: ${error.message}`)
}

export type { MedioPago }
