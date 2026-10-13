import { NextResponse, type NextRequest } from 'next/server'
import { AuthorizationError } from '@/lib/dal/errors'
import { requireModuleRole } from '@/lib/dal/guard'
import { verifySession } from '@/lib/dal/session'
import { lookupItemParaConsignacionRevendedora } from '@/lib/dal/revendedoras'

export async function GET(req: NextRequest) {
  try {
    const session = await verifySession()
    await requireModuleRole(session, 'revendedoras', 'ver')
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return NextResponse.json({ ok: false, reason: e.reason }, { status: 401 })
    }
    throw e
  }

  const qr = req.nextUrl.searchParams.get('qr')?.trim()
  const idRevendedora = req.nextUrl.searchParams.get('id_revendedora')?.trim()

  if (!qr) {
    return NextResponse.json({ ok: false, reason: 'qr-vacio' }, { status: 400 })
  }
  if (!idRevendedora) {
    return NextResponse.json({ ok: false, reason: 'revendedora-requerida' }, { status: 400 })
  }

  const result = await lookupItemParaConsignacionRevendedora(qr, idRevendedora)

  if (!result.ok) {
    return NextResponse.json(result)
  }

  return NextResponse.json({
    ok: true,
    item: result.data,
  })
}
