import 'server-only'
import { createServerClient } from '@/lib/dal/supabase'
import type {
  MedioPagoRecargo,
  RecargoCuotasRow,
  TipoValorRegla,
} from '@/lib/types/precios'

/**
 * Recargo por cuotas (00063): cuánto se le suma al precio por pagar en partes,
 * según quién financie.
 *
 * Sin SP: CRUD directo por PostgREST bajo la política RLS del tenant, igual
 * que `arancel_cobro` — del que esta tabla es el espejo. Ver `arancel.ts`.
 *
 * Los recargos NO se borran: se cierra la vigencia. Un precio viejo tiene que
 * poder explicarse con el recargo que estaba vigente ese día, no con el de hoy.
 */
export async function listRecargosCuotas(opts?: {
  /** Por defecto sólo los vigentes (sin `vigente_hasta`). */
  incluirCerrados?: boolean
}): Promise<RecargoCuotasRow[]> {
  const supabase = await createServerClient()
  let q = supabase
    .from('recargo_cuotas')
    .select('*')
    .order('cuotas', { ascending: true })
    // Los comodines al final: el específico se lee primero, igual que la
    // precedencia con la que los resuelve `resolverRecargoCuotas`.
    .order('id_cuenta_destino', { ascending: true, nullsFirst: false })
    .order('medio', { ascending: true, nullsFirst: false })
  if (!opts?.incluirCerrados) q = q.is('vigente_hasta', null)

  const { data, error } = await q
  if (error) throw new Error(`listRecargosCuotas: ${error.message}`)
  return (data ?? []) as RecargoCuotasRow[]
}

export interface RecargoCuotasInsert {
  cuotas: number
  /** `null` = comodín. Incompatible con `propia`. */
  idCuentaDestino?: string | null
  /** `null` = comodín. Incompatible con `propia`. */
  medio?: MedioPagoRecargo | null
  /** `true` = lo financia el comercio. Fuerza cuenta y medio a `null`. */
  propia?: boolean
  tipoValor?: TipoValorRegla
  /** En porcentaje, 10 = +10%. En monto_fijo, el importe. */
  valor: number
  vigenteDesde?: string
  notas?: string | null
}

export async function createRecargoCuotas(
  idTenant: string,
  input: RecargoCuotasInsert,
): Promise<RecargoCuotasRow> {
  const supabase = await createServerClient()
  // La financiación propia no tiene procesador. Normalizarlo acá evita chocar
  // contra `recargo_cuotas_propia_sin_procesador` con un error de constraint
  // que el operador no puede interpretar.
  const propia = input.propia ?? false
  const { data, error } = await supabase
    .from('recargo_cuotas')
    .insert({
      id_tenant: idTenant,
      cuotas: input.cuotas,
      id_cuenta_destino: propia ? null : (input.idCuentaDestino ?? null),
      medio: propia ? null : (input.medio ?? null),
      propia,
      tipo_valor: input.tipoValor ?? 'porcentaje',
      valor: input.valor,
      vigente_desde: input.vigenteDesde ?? undefined,
      notas: input.notas ?? null,
    })
    .select('*')
    .single()
  if (error) throw new Error(`createRecargoCuotas: ${error.message}`)
  return data as RecargoCuotasRow
}

/**
 * Corrección de una fila mal cargada. Para un cambio REAL de recargo usar
 * `cerrarVigenciaRecargo` + alta nueva: editar en el lugar reescribe la
 * historia y hace que un precio viejo deje de poder explicarse.
 */
export async function updateRecargoCuotas(
  id: string,
  patch: { tipo_valor?: TipoValorRegla; valor?: number; notas?: string | null },
): Promise<void> {
  const supabase = await createServerClient()
  const { error } = await supabase
    .from('recargo_cuotas')
    .update(patch)
    .eq('id_recargo_cuotas', id)
  if (error) throw new Error(`updateRecargoCuotas: ${error.message}`)
}

/**
 * Cierra la vigencia de un recargo. El unique index parcial de 00063 sólo mira
 * las filas con `vigente_hasta is null`, así que después de esto se puede dar
 * de alta el reemplazo sin chocar.
 */
export async function cerrarVigenciaRecargo(id: string, hasta: string): Promise<void> {
  const supabase = await createServerClient()
  const { error } = await supabase
    .from('recargo_cuotas')
    .update({ vigente_hasta: hasta })
    .eq('id_recargo_cuotas', id)
  if (error) throw new Error(`cerrarVigenciaRecargo: ${error.message}`)
}
