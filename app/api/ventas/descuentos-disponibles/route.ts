import { NextResponse, type NextRequest } from 'next/server'
import { AuthorizationError } from '@/lib/dal/errors'
import { requireModuleRole } from '@/lib/dal/guard'
import { verifySession } from '@/lib/dal/session'
import { listDescuentosDisponiblesVenta } from '@/lib/dal/precios/resolucion'

/**
 * GET /api/ventas/descuentos-disponibles?productos=<id,id,...>
 *
 * Devuelve los descuentos vigentes que aplican a cada producto del carrito.
 * La UI los agrupa: alcance='producto' se ofrece por fila; global / categoría
 * / proveedor en el panel lateral.
 *
 *   200 { ok:true, descuentos: DescuentoDisponible[] }
 *   401 unauthorized
 */
export async function GET(req: NextRequest) {
  try {
    const session = await verifySession()
    await requireModuleRole(session, 'ventas', 'ver')
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return NextResponse.json({ ok: false, reason: e.reason }, { status: 401 })
    }
    throw e
  }

  const ids = (req.nextUrl.searchParams.get('productos') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const descuentos = await listDescuentosDisponiblesVenta(ids)
  return NextResponse.json({ ok: true, descuentos })
}
