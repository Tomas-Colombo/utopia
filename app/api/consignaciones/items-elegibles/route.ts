import { NextResponse, type NextRequest } from 'next/server'
import { AuthorizationError } from '@/lib/dal/errors'
import { requireModuleRole } from '@/lib/dal/guard'
import { verifySession } from '@/lib/dal/session'
import { listItemsElegiblesConsignacion } from '@/lib/dal/consignaciones/consignacion'

/**
 * GET /api/consignaciones/items-elegibles?id_proveedor=<uuid>
 *
 * Unidades que se pueden apartar para ese proveedor: `disponible`,
 * `tipo_ingreso='consignacion'`, sin consignación pendiente ni reserva activa.
 *
 * Existe para el alta de un lote nuevo, donde el proveedor se elige en el
 * cliente y la lista tiene que recargarse sin volver al server component.
 * Read-only: la validación real vive en `sp_agregar_item_consignacion`.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await verifySession()
    await requireModuleRole(session, 'consignaciones', 'ver')
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return NextResponse.json({ ok: false, reason: e.reason }, { status: 401 })
    }
    throw e
  }

  const idProveedor = req.nextUrl.searchParams.get('id_proveedor')?.trim()
  if (!idProveedor) {
    return NextResponse.json({ ok: false, reason: 'proveedor-vacio' }, { status: 400 })
  }

  const items = await listItemsElegiblesConsignacion(idProveedor)
  return NextResponse.json({ ok: true, items })
}
