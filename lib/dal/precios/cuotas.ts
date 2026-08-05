import 'server-only'
import { createServerClient } from '@/lib/dal/supabase'
import type { PlanCuotasRow } from '@/lib/types/precios'

/**
 * Planes de cuotas que ofrece el tenant (00052). Sin SP: CRUD directo por
 * PostgREST bajo la política RLS del tenant, como el resto de las tablas de
 * configuración (ver `cuenta-destino.ts`).
 */
export async function listPlanesCuotas(opts?: {
  soloActivos?: boolean
}): Promise<PlanCuotasRow[]> {
  const supabase = await createServerClient()
  let q = supabase
    .from('plan_cuotas')
    .select('*')
    .order('cuotas', { ascending: true })
  if (opts?.soloActivos) q = q.eq('activo', true)
  const { data, error } = await q
  if (error) throw new Error(`listPlanesCuotas: ${error.message}`)
  return (data ?? []) as PlanCuotasRow[]
}

/**
 * Alta idempotente. Volver a agregar un plan dado de baja lo reactiva en vez
 * de fallar contra la PK — es lo que espera el usuario al re-tipear el número.
 */
export async function upsertPlanCuotas(idTenant: string, cuotas: number): Promise<void> {
  const supabase = await createServerClient()
  const { error } = await supabase
    .from('plan_cuotas')
    .upsert(
      { id_tenant: idTenant, cuotas, activo: true },
      { onConflict: 'id_tenant,cuotas' },
    )
  if (error) throw new Error(`upsertPlanCuotas: ${error.message}`)
}

/**
 * Baja/alta lógica. No se borra la fila: las reglas de recargo y las ventas
 * históricas siguen apuntando a esa forma de pago.
 */
export async function setPlanCuotasActivo(cuotas: number, activo: boolean): Promise<void> {
  const supabase = await createServerClient()
  const { error } = await supabase
    .from('plan_cuotas')
    .update({ activo })
    .eq('cuotas', cuotas)
  if (error) throw new Error(`setPlanCuotasActivo: ${error.message}`)
}
