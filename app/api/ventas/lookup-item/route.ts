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
import { getReservasActivasDeItems } from '@/lib/dal/reservas'
import { parsearCantidadLookup, evaluarCantidadDisponible } from '@/lib/inventario/cantidades'
import { armarRespuestaElegirTalle, decidirLookupPorTalle } from '@/lib/inventario/codigo'
import type { FormaPago, MedioPagoRecargo } from '@/lib/types/precios'
import type { ItemProductoRow } from '@/lib/types/inventario'
import type { LineaCarrito } from '@/lib/types/ventas'

/**
 * GET /api/ventas/lookup-item?code=<qr-o-sku>&forma_pago=<fp>&fin_cuenta=&fin_medio=&fin_propia=&cantidad=<n>
 *
 * Endpoint interno del carrito de venta. Acepta:
 *   - `code`: QR exacto del ítem, o SKU del producto (`REM-0007` /
 *     `REM-0007-M`). El QR resuelve la unidad exacta; el SKU elige una
 *     unidad disponible (FIFO) del producto/talle, saltando las reservadas.
 *     Si la categoría usa talles y el código no especifica talle, responde
 *     `elegir-talle` con el stock libre de cada talle.
 *   - `qr` (legacy): sólo QR exacto (lo usa el refresco de precios).
 *   - `id_producto` (+ `talle` opcional): búsqueda por nombre desde la UI
 *     (venta sin lector QR). Elige unidades disponibles del producto. Si la
 *     categoría usa talles y no vino `talle`, NUNCA elige solo: responde
 *     `elegir-talle` con el stock libre de cada talle.
 *   - `cantidad`: número de unidades deseadas (hasta 50). Permite cargar N
 *     unidades en una sola respuesta calculando el snapshot de precio 1 vez.
 *   - `excluir`: ids de ítem que ya están en el carrito. Se saltean al elegir
 *     la unidad, para poder cargar dos unidades del mismo producto/talle.
 *
 * READ ONLY — NO reserva el item ni cambia estado. La transacción real
 * ocurre al confirmar la venta con sp_registrar_venta.
 *
 * Retorna:
 *   200 { ok:true, linea: LineaCarrito, lineas: LineaCarrito[], aviso?: 'stock-parcial-disponible' }
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
  const cantidadPedida = parsearCantidadLookup(params.get('cantidad'))
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

  const itemsElegidos: Array<{ item: ItemProductoRow; advertencia: string | null }> = []
  let aviso: 'stock-parcial-disponible' | undefined = undefined
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
      let adv: string | null = null
      const reservasMap = await getReservasActivasDeItems([porQr.id_item])
      const rid = reservasMap.get(porQr.id_item)
      if (rid) {
        if (idReservaCtx && rid === idReservaCtx) adv = 'Item de esta reserva'
        else return NextResponse.json({ ok: false, reason: 'item-en-reserva', id_reserva: rid })
      }
      itemsElegidos.push({ item: porQr, advertencia: adv })
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

  if (itemsElegidos.length === 0 && productoResuelto) {
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

    const reservasMap = await getReservasActivasDeItems(candidatos.map((c) => c.id_item))

    let bloqueante: string | null = null
    for (const c of candidatos) {
      if (itemsElegidos.length >= cantidadPedida) break
      const rid = reservasMap.get(c.id_item)
      if (!rid) {
        itemsElegidos.push({ item: c, advertencia: null })
      } else if (idReservaCtx && rid === idReservaCtx) {
        itemsElegidos.push({ item: c, advertencia: 'Item de esta reserva' })
      } else {
        bloqueante ??= rid
      }
    }

    if (itemsElegidos.length === 0) {
      return NextResponse.json({
        ok: false,
        reason: candidatos.length > 0 ? 'sku-sin-stock-libre' : 'sku-sin-stock',
        sku: productoResuelto.sku,
        talle: decision.filtroTalle ?? null,
        id_reserva: bloqueante,
      })
    }

    const evaluacion = evaluarCantidadDisponible(cantidadPedida, itemsElegidos.length)
    aviso = evaluacion.aviso
  }

  if (itemsElegidos.length === 0) return NextResponse.json({ ok: false, reason: 'item-not-found' })

  const primerItem = itemsElegidos[0].item
  const producto = productoResuelto ?? (await getProductoConCategoria(primerItem.id_producto))

  const snap = await calcularSnapshotPrecio({
    idProducto: primerItem.id_producto,
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

  const lineas: LineaCarrito[] = itemsElegidos.map(({ item: it, advertencia: adv }) => ({
    id_item: it.id_item,
    id_producto: it.id_producto,
    qr_code: it.qr_code,
    talle: it.talle,
    producto_nombre: producto?.nombre ?? '(producto sin nombre)',
    sku: producto?.sku ?? null,
    categoria_nombre: producto?.categoria?.nombre ?? null,
    precio_lista: snap.precio_lista,
    precio_final: snap.precio_final,
    desactualizado: snap.desactualizado,
    desglose: snap.desglose,
    advertencia: adv,
  }))

  return NextResponse.json({
    ok: true,
    linea: lineas[0],
    lineas,
    aviso,
  })
}
