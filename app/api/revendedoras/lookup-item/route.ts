import { NextResponse, type NextRequest } from 'next/server'
import { AuthorizationError } from '@/lib/dal/errors'
import { requireModuleRole } from '@/lib/dal/guard'
import { verifySession } from '@/lib/dal/session'
import {
  lookupItemParaConsignacionRevendedora,
  lookupItemParaVentaRevendedora,
} from '@/lib/dal/revendedoras'

export async function GET(req: NextRequest) {
  try {
    const session = await verifySession()
    if (session.idRevendedora) {
      throw new AuthorizationError('no-permission')
    }
    await requireModuleRole(session, 'revendedoras', 'ver')
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return NextResponse.json({ ok: false, reason: e.reason }, { status: 401 })
    }
    throw e
  }

  const code = (req.nextUrl.searchParams.get('code') || req.nextUrl.searchParams.get('qr'))?.trim()
  const idProducto = req.nextUrl.searchParams.get('id_producto')?.trim()
  const idRevendedora = req.nextUrl.searchParams.get('id_revendedora')?.trim()
  const modo = req.nextUrl.searchParams.get('modo')?.trim() || 'consignacion'

  if (!code && !idProducto) {
    return NextResponse.json({ ok: false, reason: 'qr-vacio' }, { status: 400 })
  }
  if (!idRevendedora) {
    return NextResponse.json({ ok: false, reason: 'revendedora-requerida' }, { status: 400 })
  }

  if (modo === 'venta') {
    const result = await lookupItemParaVentaRevendedora(code, idRevendedora, idProducto)
    if (!result.ok) {
      return NextResponse.json(result)
    }
    return NextResponse.json({
      ok: true,
      item: result.data.item,
      linea: result.data.linea,
    })
  }

  if (!code) {
    return NextResponse.json({ ok: false, reason: 'qr-vacio' }, { status: 400 })
  }

  const result = await lookupItemParaConsignacionRevendedora(code, idRevendedora)

  if (!result.ok) {
    return NextResponse.json(result)
  }

  return NextResponse.json({
    ok: true,
    item: result.data,
  })
}
