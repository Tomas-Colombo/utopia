import { NextResponse, type NextRequest } from 'next/server'
import { AuthorizationError } from '@/lib/dal/errors'
import { requireModuleRole } from '@/lib/dal/guard'
import { verifySession } from '@/lib/dal/session'
import { resolverCodigo } from '@/lib/dal/inventario/codigo'
import { contarDisponiblesPorTalle, listItemsDisponibles } from '@/lib/dal/inventario/item'
import {
  getProductoConCategoria,
  type ProductoRowConCategoria,
} from '@/lib/dal/inventario/producto'
import { calcularSnapshotPrecio } from '@/lib/dal/precios/resolucion'
import { createServerClient } from '@/lib/dal/supabase'
import { armarRespuestaElegirTalle, decidirLookupPorTalle } from '@/lib/inventario/codigo'
import type { FormaPago, MedioPagoRecargo } from '@/lib/types/precios'
import type { ItemProductoRow } from '@/lib/types/inventario'
import type { LineaCarrito } from '@/lib/types/ventas'

/**
 * GET /api/ventas/lookup-item?code=<qr-o-sku>&forma_pago=<fp>&fin_cuenta=&fin_medio=&fin_propia=
 *
 * Endpoint interno del carrito de venta. Acepta:
 *   - `code`: QR exacto del ítem, o SKU del producto (`REM-0007` /
 *     `REM-0007-M`). El QR resuelve la unidad exacta; el SKU elige una
 *     unidad disponible (FIFO) del producto/talle, saltando las reservadas.
 *     Si la categoría usa talles y el código no especifica talle, responde
 *     `elegir-talle` con el stock libre de cada talle.
 *   - `qr` (legacy): sólo QR exacto (lo usa el refresco de precios).
 *   - `id_producto` (+ `talle` opcional): búsqueda por nombre desde la UI
 *     (venta sin lector QR). Elige una unidad disponible del producto. Si la
 *     categoría usa talles y no vino `talle`, NUNCA elige solo: responde
 *     `elegir-talle` con el stock libre de cada talle.
 *   - `excluir`: ids de ítem que ya están en el carrito. Se saltean al elegir
 *     la unidad, para poder cargar dos unidades del mismo producto/talle.
 *
 * READ ONLY — NO reserva el item ni cambia estado. La transacción real
 * ocurre al confirmar la venta con sp_registrar_venta.
 *
 * Retorna:
 *   200 { ok:true, linea: LineaCarrito }
 *   200 { ok:false, reason: 'item-not-found'|'item-no-disponible'|
 *          'item-en-reserva'|'sin-precio-lista'|'sku-sin-stock'|
 *          'sku-sin-stock-libre'|'stock-sin-talle' }
 *   200 { ok:false, reason:'elegir-talle',
 *          id_producto: string, producto_nombre: string,
 *          talles: Array<{ talle: string; disponibles: number; reservados: number }>,
 *          sin_talle: number, sin_talle_reservados: number, id_reserva: string | null }
 *   401 unauthorized
 */
export async function GET(req: NextRequest) {
  try {
    const session = await verifySession()
    if (session.idRevendedora) {
      throw new AuthorizationError('no-permission')
    }
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
  // El usuario explícitamente eligió una unidad SIN talle desde el picker.
  // No es lo mismo que "no vino talle" (eso sería el gate de desambiguación).
  const sinTalleParam = params.get('sin_talle') === '1'
  const formaPago = (params.get('forma_pago') as FormaPago | null) ?? 'efectivo'
  // Financiador (00064): define qué recargo por cuotas se aplica. Viaja acá
  // porque el precio de CADA línea depende de él, igual que de forma_pago.
  // Sin estos parámetros el snapshot resuelve el comodín, que es lo que hacía
  // antes de que el recargo pudiera distinguir por destino.
  const finPropia = params.get('fin_propia') === '1'
  const finCuenta = finPropia ? null : (params.get('fin_cuenta')?.trim() || null)
  const finMedio = finPropia
    ? null
    : ((params.get('fin_medio')?.trim() || null) as MedioPagoRecargo | null)
  const idReservaCtx = params.get('id_reserva')?.trim() ?? null
  // Descuentos elegidos por el vendedor. Se mandan TODOS juntos; el snapshot
  // valida cada uno contra el producto (alcance + vigencia) e ignora los que
  // no aplican. Así el cliente no necesita saber qué descuento pega en qué.
  const idsDescuentos = (params.get('descuentos') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  // Unidades ya cargadas en el carrito: no son candidatas.
  const excluir = (params.get('excluir') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const excluidos = new Set(excluir)

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
  let productoResuelto: ProductoRowConCategoria | null = null
  let talleExplicito: string | null = talleParam

  if (input) {
    // QR exacto, o SKU con talle opcional. El path `qr` legacy es estricto:
    // sólo QR.
    const resuelto = await resolverCodigo(input, { sku: Boolean(code) })
    if (!resuelto) return NextResponse.json({ ok: false, reason: 'item-not-found' })

    if (resuelto.tipo === 'item') {
      const porQr = resuelto.item
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
    } else {
      productoResuelto = resuelto.producto
      talleExplicito = resuelto.talle ?? talleParam
    }
  } else if (idProductoParam) {
    productoResuelto = await getProductoConCategoria(idProductoParam)
    if (!productoResuelto) return NextResponse.json({ ok: false, reason: 'item-not-found' })
  } else {
    return NextResponse.json({ ok: false, reason: 'item-not-found' })
  }

  if (!item && productoResuelto) {
    const tallesCategoria = productoResuelto.categoria?.talles ?? []
    const decision = decidirLookupPorTalle({
      tallesCategoria,
      talleExplicito,
      sinTalleExplicito: sinTalleParam,
    })

    // Si la categoría usa talles y el usuario NO eligió aún (ni un talle
    // concreto ni "sin talle" explícito), el server nunca decide: devuelve el
    // stock libre por talle + cuántas quedaron sin talle asignado, y que el
    // vendedor elija. Las "sin talle" se venden si el usuario las eligió a
    // propósito — no las bloqueamos, porque a veces se cargó así queriendo.
    if (decision.modo === 'desambiguar') {
      const { porTalle, totalDisponible, reservasBloqueantes } =
        await contarDisponiblesPorTalle(productoResuelto.id_producto, { idReservaCtx, excluir })
      return NextResponse.json(
        armarRespuestaElegirTalle({
          idProducto: productoResuelto.id_producto,
          productoNombre: productoResuelto.nombre,
          tallesCategoria,
          porTalle,
          reservasBloqueantes,
          totalDisponible,
        }),
      )
    }

    const candidatos = (
      await listItemsDisponibles(productoResuelto.id_producto, decision.filtroTalle)
    ).filter((c) => !excluidos.has(c.id_item))

    let bloqueante: string | null = null
    for (const c of candidatos) {
      const rid = await reservaActiva(c.id_item)
      if (!rid) {
        item = c
        break
      }
      if (idReservaCtx && rid === idReservaCtx) {
        item = c
        advertencia = 'Item de esta reserva'
        break
      }
      bloqueante ??= rid
    }

    if (!item) {
      return NextResponse.json({
        ok: false,
        reason: candidatos.length > 0 ? 'sku-sin-stock-libre' : 'sku-sin-stock',
        sku: productoResuelto.sku,
        talle: decision.filtroTalle ?? null,
        id_reserva: bloqueante,
      })
    }
  }

  if (!item) return NextResponse.json({ ok: false, reason: 'item-not-found' })

  const producto = productoResuelto ?? (await getProductoConCategoria(item.id_producto))

  const snap = await calcularSnapshotPrecio({
    idProducto: item.id_producto,
    formaPago,
    idsDescuentos,
    idCuentaDestino: finCuenta,
    medio: finMedio,
    propia: finPropia,
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
    id_producto: item.id_producto,
    qr_code: item.qr_code,
    talle: item.talle,
    producto_nombre: producto?.nombre ?? '(producto sin nombre)',
    sku: producto?.sku ?? null,
    categoria_nombre: producto?.categoria?.nombre ?? null,
    precio_lista: snap.precio_lista,
    precio_final: snap.precio_final,
    desactualizado: snap.desactualizado,
    desglose: snap.desglose,
    advertencia,
  }
  return NextResponse.json({ ok: true, linea })
}
