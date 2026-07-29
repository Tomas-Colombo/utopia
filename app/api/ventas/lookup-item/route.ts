import { NextResponse, type NextRequest } from 'next/server'
import { AuthorizationError } from '@/lib/dal/errors'
import { requireModuleRole } from '@/lib/dal/guard'
import { verifySession } from '@/lib/dal/session'
import { findItemByQr } from '@/lib/dal/inventario/item'
import { calcularSnapshotPrecio } from '@/lib/dal/precios/resolucion'
import { createServerClient } from '@/lib/dal/supabase'
import type { FormaPago } from '@/lib/types/precios'
import type { LineaCarrito } from '@/lib/types/ventas'

/**
 * GET /api/ventas/lookup-item?qr=<code>&forma_pago=<fp>
 *
 * Endpoint interno usado por el carrito de venta cuando el operador
 * escanea o tipea un QR. Devuelve una `LineaCarrito` lista para
 * agregar, o `{ ok: false, reason }`.
 *
 * Este endpoint es de READ ONLY — NO reserva el item ni cambia estado.
 * La transacción real ocurre al confirmar la venta con sp_registrar_venta.
 *
 * Retorna:
 *   200 { ok:true, linea: LineaCarrito }
 *   200 { ok:false, reason: 'item-not-found'|'item-no-disponible'|
 *                            'item-en-reserva'|'sin-precio-lista' }
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

  const qr = req.nextUrl.searchParams.get('qr')?.trim()
  const formaPago = (req.nextUrl.searchParams.get('forma_pago') as FormaPago | null) ?? 'efectivo'
  const idReservaCtx = req.nextUrl.searchParams.get('id_reserva')?.trim() ?? null

  if (!qr) return NextResponse.json({ ok: false, reason: 'qr-vacio' }, { status: 400 })

  const item = await findItemByQr(qr)
  if (!item) {
    return NextResponse.json({ ok: false, reason: 'item-not-found' })
  }
  if (item.estado_item !== 'disponible') {
    return NextResponse.json({
      ok: false,
      reason: 'item-no-disponible',
      estado: item.estado_item,
    })
  }

  // Chequeo de reserva activa
  const supabase = await createServerClient()
  const { data: dr } = await supabase
    .from('detalle_reserva')
    .select('id_detalle_reserva, id_reserva')
    .eq('id_item', item.id_item)
    .eq('estado', 'activa')
    .maybeSingle()

  let advertencia: string | null = null
  if (dr) {
    const dr_id_reserva = (dr as { id_reserva: string }).id_reserva
    if (idReservaCtx && dr_id_reserva === idReservaCtx) {
      advertencia = 'Item de esta reserva'
    } else {
      return NextResponse.json({
        ok: false,
        reason: 'item-en-reserva',
        id_reserva: dr_id_reserva,
      })
    }
  }

  // Producto + categoría
  const { data: producto } = await supabase
    .from('producto')
    .select('id_producto, nombre, sku, categoria:categoria(id_categoria, nombre)')
    .eq('id_producto', item.id_producto)
    .maybeSingle<{
      id_producto: string
      nombre: string
      sku: string | null
      categoria: { id_categoria: string; nombre: string } | null
    }>()

  const snap = await calcularSnapshotPrecio({
    idProducto: item.id_producto,
    formaPago,
  })

  if (!snap.ok) {
    return NextResponse.json({
      ok: false,
      reason: snap.reason,
      requiere_recalcular: snap.reason === 'sin-precio-lista',
    })
  }

  const linea: LineaCarrito = {
    id_item: item.id_item,
    qr_code: item.qr_code,
    producto_nombre: producto?.nombre ?? '(producto sin nombre)',
    sku: producto?.sku ?? null,
    categoria_nombre: producto?.categoria?.nombre ?? null,
    precio_lista: snap.precio_lista,
    precio_final: snap.precio_final,
    desactualizado: snap.desactualizado,
    desglose: snap.desglose as Record<string, unknown>,
    advertencia,
  }
  return NextResponse.json({ ok: true, linea })
}
