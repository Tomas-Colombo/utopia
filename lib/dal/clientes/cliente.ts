import 'server-only'
import { createServerClient } from '@/lib/dal/supabase'
import type { ClienteInsert, ClienteRow } from '@/lib/types/ventas'

export async function listClientes(opts?: {
  soloActivos?: boolean
  search?: string
}): Promise<ClienteRow[]> {
  const supabase = await createServerClient()
  let q = supabase.from('cliente').select('*').order('nombre', { ascending: true })
  if (opts?.soloActivos) q = q.eq('activo', true)
  if (opts?.search && opts.search.trim().length > 0) {
    const pat = `%${opts.search.trim()}%`
    q = q.or(`nombre.ilike.${pat},email.ilike.${pat},telefono.ilike.${pat}`)
  }
  const { data, error } = await q
  if (error) throw new Error(`listClientes: ${error.message}`)
  return (data ?? []) as ClienteRow[]
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
