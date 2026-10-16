import 'server-only'
import { createServerClient } from '@/lib/dal/supabase'
import type { Session } from '@/lib/dal/session'
import { requireModuleRole } from '@/lib/dal/guard'
import { AuthorizationError } from '@/lib/dal/errors'
import type {
  ConfirmarDeclaracionVentaPayload,
  RechazarDeclaracionVentaPayload,
  DeclaracionesLocalQuery,
} from '@/lib/validation/revendedoras'
import type { DeclaracionVentaLocalRow } from '@/lib/types/revendedoras'

function extractErrorSlug(error: { code?: string; message?: string }): string {
  const msg = error.message || ''
  const code = error.code || ''

  if (code === '42501' || msg.includes('no-permission')) return 'no-permission'
  if (msg.includes('modulo-revendedoras-deshabilitado')) return 'modulo-revendedoras-deshabilitado'
  if (msg.includes('precio-no-resoluble')) {
    const match = msg.match(/precio-no-resoluble[^\n]*/)
    return match ? match[0].trim() : 'precio-no-resoluble'
  }
  if (msg.includes('declaracion-no-encontrada')) return 'declaracion-no-encontrada'
  if (msg.includes('declaracion-no-pendiente')) return 'declaracion-no-pendiente'
  if (msg.includes('motivo-requerido')) return 'motivo-requerido'
  if (msg.includes('item-no-disponible')) return 'item-no-disponible'
  if (msg.includes('item-no-en-revendedora')) return 'item-no-en-revendedora'

  const cleaned = msg.replace(/^.*(?:sp|rvp|rf)_[a-zA-Z0-9_]+:\s*/, '').trim()
  const candidate = cleaned.split(':')[0]?.trim().toLowerCase() || ''

  if (candidate && /^[a-z0-9-]+$/.test(candidate)) {
    return candidate
  }

  return 'error-desconocido'
}

export async function listarDeclaracionesLocal(
  session: Session,
  query?: DeclaracionesLocalQuery,
): Promise<{ ok: true; data: { declaraciones: DeclaracionVentaLocalRow[]; total: number } } | { ok: false; reason: string }> {
  if (session.idRevendedora) {
    throw new AuthorizationError('no-permission')
  }
  await requireModuleRole(session, 'revendedoras', 'ver')

  const supabase = await createServerClient()
  const page = query?.page ?? 1
  const limit = Math.min(Math.max(query?.limit ?? 50, 1), 200)
  const offset = (page - 1) * limit

  let q = supabase
    .from('declaracion_venta_revendedora')
    .select(
      `
      id_declaracion,
      id_tenant,
      id_revendedora,
      id_item,
      fecha,
      nota,
      estado,
      id_venta,
      motivo_rechazo,
      created_at,
      revendedora:revendedora!declaracion_venta_revendedora_fk (
        nombre,
        apellido
      ),
      item:item_producto!declaracion_venta_item_fk (
        id_item,
        talle,
        producto:producto (
          nombre,
          sku,
          precio_venta
        )
      )
    `,
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })

  if (query?.id_revendedora) {
    q = q.eq('id_revendedora', query.id_revendedora)
  }

  if (query?.estado && query.estado !== 'todas') {
    q = q.eq('estado', query.estado)
  }

  q = q.range(offset, offset + limit - 1)

  const { data, count, error } = await q

  if (error) {
    return { ok: false, reason: extractErrorSlug(error) }
  }

  interface DeclaracionDbRow {
    id_declaracion: string
    id_tenant: string
    id_revendedora: string
    id_item: string
    fecha: string
    nota: string | null
    estado: 'pendiente' | 'confirmada' | 'rechazada' | 'retirada'
    id_venta: string | null
    motivo_rechazo: string | null
    created_at: string
    revendedora?: { nombre?: string; apellido?: string } | null
    item?: {
      id_item: string
      talle: string | null
      producto?: { nombre?: string; sku?: string; precio_venta?: number } | null
    } | null
  }

  const rows = (data ?? []) as unknown as DeclaracionDbRow[]
  const declaraciones: DeclaracionVentaLocalRow[] = rows.map((row) => ({
    id_declaracion: row.id_declaracion,
    id_tenant: row.id_tenant,
    id_revendedora: row.id_revendedora,
    revendedora_nombre: row.revendedora?.nombre ?? '',
    revendedora_apellido: row.revendedora?.apellido ?? '',
    id_item: row.id_item,
    nombre_producto: row.item?.producto?.nombre ?? 'Producto',
    sku: row.item?.producto?.sku ?? '',
    talle: row.item?.talle ?? null,
    precio_venta: Number(row.item?.producto?.precio_venta ?? 0),
    fecha: row.fecha,
    nota: row.nota,
    estado: row.estado,
    id_venta: row.id_venta,
    motivo_rechazo: row.motivo_rechazo,
    created_at: row.created_at,
  }))

  return {
    ok: true,
    data: {
      declaraciones,
      total: count ?? 0,
    },
  }
}

export async function confirmarDeclaracionVenta(
  session: Session,
  payload: ConfirmarDeclaracionVentaPayload,
): Promise<{ ok: true; data: string } | { ok: false; reason: string }> {
  if (session.idRevendedora) {
    throw new AuthorizationError('no-permission')
  }
  await requireModuleRole(session, 'revendedoras', 'crear')

  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('sp_confirmar_declaracion_venta', {
    p_id_declaracion: payload.id_declaracion,
  })

  if (error) {
    return { ok: false, reason: extractErrorSlug(error) }
  }

  return { ok: true, data: data as string }
}

export async function rechazarDeclaracionVenta(
  session: Session,
  payload: RechazarDeclaracionVentaPayload,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (session.idRevendedora) {
    throw new AuthorizationError('no-permission')
  }
  await requireModuleRole(session, 'revendedoras', 'crear')

  const supabase = await createServerClient()
  const { error } = await supabase.rpc('sp_rechazar_declaracion_venta', {
    p_id_declaracion: payload.id_declaracion,
    p_motivo: payload.motivo,
  })

  if (error) {
    return { ok: false, reason: extractErrorSlug(error) }
  }

  return { ok: true }
}
