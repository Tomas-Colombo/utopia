import { NextResponse, type NextRequest } from 'next/server'
import { AuthorizationError } from '@/lib/dal/errors'
import { requireModuleRole } from '@/lib/dal/guard'
import { verifySession } from '@/lib/dal/session'
import { findItemByQr, listItemsDisponibles } from '@/lib/dal/inventario/item'
import { findProductoBySku } from '@/lib/dal/inventario/producto'
import { calcularSnapshotPrecio } from '@/lib/dal/precios/resolucion'
import { createServerClient } from '@/lib/dal/supabase'
import type { FormaPago } from '@/lib/types/precios'
import type { ItemProductoRow } from '@/lib/types/inventario'
import type { LineaCarrito } from '@/lib/types/ventas'

/**
 * GET /api/ventas/lookup-item?code=<qr-o-sku>&forma_pago=<fp>
 *
 * Endpoint interno del carrito de venta. Acepta:
 *   - `code`: QR exacto del ítem, o SKU del producto (`REM-0007` /
 *     `REM-0007-M`). El QR resuelve la unidad exacta; el SKU elige una
 *     unidad disponible (FIFO) del producto/talle, saltando las reservadas.
 *   - `qr` (legacy): sólo QR exacto (lo usa el refresco de precios).
 *   - `id_producto` (+ `talle` opcional): búsqueda por nombre desde la UI
 *     (venta sin lector QR). Elige una unidad disponible del producto; si la
 *     categoría usa talles y hay varios con stock, responde `elegir-talle`.
 *
 * READ ONLY — NO reserva el item ni cambia estado. La transacción real
 * ocurre al confirmar la venta con sp_registrar_venta.
 *
 * Retorna:
 *   200 { ok:true, linea: LineaCarrito }
 *   200 { ok:false, reason: 'item-not-found'|'item-no-disponible'|
 *          'item-en-reserva'|'sin-precio-lista'|'sku-sin-stock'|
 *          'sku-sin-stock-libre'|'elegir-talle' }
 *   200 { ok:false, reason:'elegir-talle', talles: string[] }
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

  const params = req.nextUrl.searchParams
  const code = params.get('code')?.trim()
  const qrLegacy = params.get('qr')?.trim()
  const input = code || qrLegacy
  const idProductoParam = params.get('id_producto')?.trim()
  const talleParam = params.get('talle')?.trim() || null
  const formaPago = (params.get('forma_pago') as FormaPago | null) ?? 'efectivo'
  const idReservaCtx = params.get('id_reserva')?.trim() ?? null

  if (!input && !idProductoParam)
    return NextResponse.json({ ok: false, reason: 'qr-vacio' }, { status: 400 })

  const supabase = await createServerClient()

  // Reserva activa de un ítem: devuelve el id_reserva que lo tiene, o null.
  async function reservaActiva(idItem: string): Promise<string | null> {
    const { data } = await supabase
      .from('detalle_reserva')
      .select('id_reserva')
      .eq('id_item', idItem)
      .eq('estado', 'activa')
      .maybeSingle()
    return (data as { id_reserva: string } | null)?.id_reserva ?? null
  }

  let item: ItemProductoRow | null = null
  let advertencia: string | null = null

  if (input) {
    // 1) QR exacto.
    const porQr = await findItemByQr(input)
    if (porQr) {
      if (porQr.estado_item !== 'disponible') {
        return NextResponse.json({
          ok: false,
          reason: 'item-no-disponible',
          estado: porQr.estado_item,
        })
      }
      const rid = await reservaActiva(porQr.id_item)
      if (rid) {
        if (idReservaCtx && rid === idReservaCtx) advertencia = 'Item de esta reserva'
        else return NextResponse.json({ ok: false, reason: 'item-en-reserva', id_reserva: rid })
      }
      item = porQr
    } else if (code) {
      // 2) SKU con talle opcional (sólo por `code`; el path `qr` legacy es estricto).
      const upper = input.toUpperCase()
      const m = upper.match(/^([A-Z]+-\d+)(?:-(.+))?$/)
      const baseSku = m?.[1] ?? upper
      const talle = m?.[2] ?? null

      const producto = await findProductoBySku(baseSku)
      if (!producto) return NextResponse.json({ ok: false, reason: 'item-not-found' })

      const candidatos = await listItemsDisponibles(producto.id_producto, talle)
      for (const c of candidatos) {
        const rid = await reservaActiva(c.id_item)
        if (!rid) { item = c; break }
        if (idReservaCtx && rid === idReservaCtx) {
          item = c
          advertencia = 'Item de esta reserva'
          break
        }
      }
      if (!item) {
        return NextResponse.json({
          ok: false,
          reason: candidatos.length > 0 ? 'sku-sin-stock-libre' : 'sku-sin-stock',
          sku: baseSku,
          talle,
        })
      }
    } else {
      return NextResponse.json({ ok: false, reason: 'item-not-found' })
    }
  } else if (idProductoParam) {
    // 3) Búsqueda por producto (venta sin lector QR): elige una unidad
    //    disponible del producto. Si la categoría usa talles y hay más de uno
    //    con stock libre, pide desambiguar (reason: 'elegir-talle').
    const { data: prod } = await supabase
      .from('producto')
      .select('id_producto, categoria:categoria(talles)')
      .eq('id_producto', idProductoParam)
      .maybeSingle<{ id_producto: string; categoria: { talles: string[] } | null }>()
    if (!prod) return NextResponse.json({ ok: false, reason: 'item-not-found' })
    const usaTalles = (prod.categoria?.talles?.length ?? 0) > 0

    const candidatos = await listItemsDisponibles(idProductoParam, talleParam)
    const usables: { c: ItemProductoRow; adv: string | null }[] = []
    for (const c of candidatos) {
      const rid = await reservaActiva(c.id_item)
      if (!rid) usables.push({ c, adv: null })
      else if (idReservaCtx && rid === idReservaCtx) usables.push({ c, adv: 'Item de esta reserva' })
    }
    if (usables.length === 0) {
      return NextResponse.json({
        ok: false,
        reason: candidatos.length > 0 ? 'sku-sin-stock-libre' : 'sku-sin-stock',
        talle: talleParam,
      })
    }
    if (usaTalles && !talleParam) {
      const talles = [
        ...new Set(usables.map((u) => u.c.talle).filter((t): t is string => !!t)),
      ].sort()
      if (talles.length > 1) {
        return NextResponse.json({ ok: false, reason: 'elegir-talle', talles })
      }
    }
    item = usables[0].c
    advertencia = usables[0].adv
  } else {
    return NextResponse.json({ ok: false, reason: 'item-not-found' })
  }

  if (!item) return NextResponse.json({ ok: false, reason: 'item-not-found' })

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
