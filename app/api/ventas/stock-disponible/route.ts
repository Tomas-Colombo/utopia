import { NextResponse, type NextRequest } from 'next/server'
import { AuthorizationError } from '@/lib/dal/errors'
import { requireModuleRole } from '@/lib/dal/guard'
import { verifySession } from '@/lib/dal/session'
import { contarDisponiblesPorTalle } from '@/lib/dal/inventario/item'

/**
 * GET /api/ventas/stock-disponible?productos=<id,id,...>&id_reserva=<id?>
 *
 * Tope físico de unidades por producto+talle para el carrito de venta. Se
 * usa para NO dejar subir la cantidad de una fila por encima del stock
 * disponible (los ítems del carrito siguen en estado 'disponible', así que
 * el conteo ya los incluye — el tope es el total real de unidades libres).
 *
 * Con `id_reserva`, las unidades reservadas por ESA reserva cuentan como
 * disponibles (se pueden vender); las reservadas por otras no.
 *
 *   200 { ok:true, stock: Array<{ id_producto, talle, disponibles }> }
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
  const idReservaCtx = req.nextUrl.searchParams.get('id_reserva')?.trim() || null

  const stock: Array<{ id_producto: string; talle: string | null; disponibles: number }> = []
  for (const id of new Set(ids)) {
    const { porTalle } = await contarDisponiblesPorTalle(id, { idReservaCtx })
    for (const s of porTalle) {
      stock.push({ id_producto: id, talle: s.talle, disponibles: s.disponibles })
    }
  }

  return NextResponse.json({ ok: true, stock })
}
