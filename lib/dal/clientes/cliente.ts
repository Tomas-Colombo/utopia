import 'server-only'
import { createServerClient } from '@/lib/dal/supabase'
import type { ClienteInsert, ClienteRow, OrdenClientes } from '@/lib/types/ventas'

/**
 * Columnas de ordenamiento, en orden de aplicación.
 *
 * El alfabético por apellido usa `apellido` con `nombre` de desempate — NO
 * `nombre_completo`, que empieza por el nombre de pila y ordenaría
 * "Ana Zurita" antes que "Bruno Álvarez".
 *
 * `nullsFirst: false` manda a los clientes sin apellido al final. Son los
 * anteriores a 00058: no es que se apelliden con Z, es que todavía no se sabe
 * cuál es su apellido, y ponerlos primero taparía la lista.
 *
 * Se devuelven como datos en vez de aplicarse sobre el query builder porque
 * las dos consultas de este módulo tienen tipos distintos (una lleva `count`),
 * y un helper que reciba el builder termina necesitando un `any`.
 */
function ordenClientes(
  orden: OrdenClientes,
): Array<{ columna: string; ascending: boolean; nullsFirst?: boolean }> {
  if (orden === 'nombre_asc') return [{ columna: 'nombre', ascending: true }]
  return [
    { columna: 'apellido', ascending: orden !== 'apellido_desc', nullsFirst: false },
    { columna: 'nombre', ascending: true },
  ]
}

/** Filtro de texto sobre nombre, apellido, nombre completo, email y teléfono. */
function patronBusqueda(search: string): string {
  const pat = `%${search.trim()}%`
  return [
    `nombre.ilike.${pat}`,
    `apellido.ilike.${pat}`,
    // Permite tipear "juan perez" de corrido, que es como se busca a alguien.
    `nombre_completo.ilike.${pat}`,
    `email.ilike.${pat}`,
    `telefono.ilike.${pat}`,
  ].join(',')
}

export async function listClientes(opts?: {
  soloActivos?: boolean
  search?: string
  orden?: OrdenClientes
}): Promise<ClienteRow[]> {
  const supabase = await createServerClient()
  let q = supabase.from('cliente').select('*')
  for (const o of ordenClientes(opts?.orden ?? 'apellido_asc')) {
    q = q.order(o.columna, { ascending: o.ascending, nullsFirst: o.nullsFirst })
  }
  if (opts?.soloActivos) q = q.eq('activo', true)
  if (opts?.search && opts.search.trim().length > 0) {
    q = q.or(patronBusqueda(opts.search))
  }
  const { data, error } = await q
  if (error) throw new Error(`listClientes: ${error.message}`)
  return (data ?? []) as ClienteRow[]
}

/**
 * Página del listado con `total`. El listado sin límite servía mientras la
 * cartera era chica; con el orden alfabético y los filtros de deuda (00059)
 * traer todo en cada render deja de ser gratis.
 */
export async function listClientesPaginado(opts: {
  page: number
  pageSize: number
  soloActivos?: boolean
  search?: string
  orden?: OrdenClientes
}): Promise<{ rows: ClienteRow[]; total: number }> {
  const supabase = await createServerClient()
  const from = (Math.max(1, opts.page) - 1) * opts.pageSize
  const to = from + opts.pageSize - 1

  let q = supabase.from('cliente').select('*', { count: 'exact' })
  for (const o of ordenClientes(opts.orden ?? 'apellido_asc')) {
    q = q.order(o.columna, { ascending: o.ascending, nullsFirst: o.nullsFirst })
  }
  q = q.range(from, to)
  if (opts.soloActivos) q = q.eq('activo', true)
  if (opts.search && opts.search.trim().length > 0) {
    q = q.or(patronBusqueda(opts.search))
  }

  const { data, count, error } = await q
  if (error) throw new Error(`listClientesPaginado: ${error.message}`)
  return { rows: (data ?? []) as ClienteRow[], total: count ?? 0 }
}

export async function getCliente(id: string): Promise<ClienteRow | null> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('cliente').select('*').eq('id_cliente', id).maybeSingle()
  if (error) throw new Error(`getCliente: ${error.message}`)
  return (data ?? null) as ClienteRow | null
}

export async function createCliente(input: ClienteInsert): Promise<ClienteRow> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('cliente').insert(input).select('*').single()
  if (error) throw new Error(`createCliente: ${error.message}`)
  return data as ClienteRow
}

export async function updateCliente(
  id: string,
  patch: Partial<Omit<ClienteInsert, 'id_tenant'>>,
): Promise<void> {
  const supabase = await createServerClient()
  const { error } = await supabase.from('cliente').update(patch).eq('id_cliente', id)
  if (error) throw new Error(`updateCliente: ${error.message}`)
}

export async function toggleClienteActivo(id: string, activo: boolean): Promise<void> {
  const supabase = await createServerClient()
  const { error } = await supabase.from('cliente').update({ activo }).eq('id_cliente', id)
  if (error) throw new Error(`toggleClienteActivo: ${error.message}`)
}
