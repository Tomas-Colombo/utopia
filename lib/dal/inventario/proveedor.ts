import 'server-only'
import { createServerClient } from '@/lib/dal/supabase'
import type { ProveedorInsert, ProveedorRow } from '@/lib/types/inventario'

export async function listProveedores(): Promise<ProveedorRow[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('proveedor').select('*').order('nombre', { ascending: true })
  if (error) throw new Error(`listProveedores: ${error.message}`)
  return (data ?? []) as ProveedorRow[]
}

export async function listProveedoresActivos(): Promise<ProveedorRow[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('proveedor').select('*').eq('activo', true).order('nombre', { ascending: true })
  if (error) throw new Error(`listProveedoresActivos: ${error.message}`)
  return (data ?? []) as ProveedorRow[]
}

export async function getProveedor(id: string): Promise<ProveedorRow | null> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('proveedor').select('*').eq('id_proveedor', id).maybeSingle()
  if (error) throw new Error(`getProveedor: ${error.message}`)
  return (data ?? null) as ProveedorRow | null
}

export async function createProveedor(input: ProveedorInsert): Promise<ProveedorRow> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('proveedor').insert(input).select('*').single()
  if (error) throw new Error(`createProveedor: ${error.message}`)
  return data as ProveedorRow
}

export async function updateProveedor(
  id: string,
  patch: Partial<Omit<ProveedorInsert, 'id_tenant'>>,
): Promise<void> {
  const supabase = await createServerClient()
  const { error } = await supabase
    .from('proveedor').update(patch).eq('id_proveedor', id)
  if (error) throw new Error(`updateProveedor: ${error.message}`)
}

/**
 * Construye el link wa.me (Planificacion.txt Etapa 3 §66 "botón wa.me").
 * Devuelve null si no hay teléfono. NO valida formato — el proveedor
 * puede tener número raro y wa.me igual funciona.
 */
export function waMeLink(telefono: string | null | undefined): string | null {
  if (!telefono) return null
  const digits = telefono.replace(/\D/g, '')
  if (digits.length < 6) return null
  return `https://wa.me/${digits}`
}
