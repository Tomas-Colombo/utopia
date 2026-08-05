import { NextResponse, type NextRequest } from 'next/server'
import { AuthorizationError } from '@/lib/dal/errors'
import { requireModuleRole } from '@/lib/dal/guard'
import { verifySession } from '@/lib/dal/session'
import { listVentasPeriodo } from '@/lib/dal/ventas/venta'
import {
  esFechaValida,
  inicioDelDia,
  inicioDelDiaSiguiente,
  mesActual,
} from '@/lib/fechas'
import { formaPagoLabel } from '@/lib/types/precios'

/**
 * GET /api/ventas/export?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 *
 * CSV del período COMPLETO (no de la página visible del listado). El rango es
 * el mismo que el de `/ventas`: días calendario inclusivos, con el mismo
 * default (mes en curso) y la misma tolerancia a params inválidos.
 *
 * Separador `;` y decimales con coma: es lo que Excel en es-AR abre sin pedir
 * un asistente de importación. El BOM al inicio es lo que hace que Excel
 * respete el UTF-8 y no rompa los acentos.
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
  const crudoDesde = params.get('desde') ?? undefined
  const crudoHasta = params.get('hasta') ?? undefined
  const porDefecto = mesActual()
  const desde = esFechaValida(crudoDesde) ? crudoDesde : porDefecto.desde
  const hastaCrudo = esFechaValida(crudoHasta) ? crudoHasta : porDefecto.hasta
  const hasta = hastaCrudo < desde ? desde : hastaCrudo

  const ventas = await listVentasPeriodo({
    desde: inicioDelDia(desde),
    hastaExclusivo: inicioDelDiaSiguiente(hasta),
  })

  const filas = [
    ['Fecha', 'Cliente', 'Forma de pago', 'Líneas', 'Total', 'Estado'],
    ...ventas.map((v) => [
      new Date(v.fecha).toLocaleString('es-AR'),
      v.cliente?.nombre ?? 'Mostrador',
      formaPagoLabel(v.forma_pago),
      String(v.lineas_count),
      numero(Number(v.total)),
      v.estado_venta === 'anulada' ? 'Anulada' : 'Registrada',
    ]),
  ]

  const csv = `﻿${filas.map((f) => f.map(escapar).join(';')).join('\r\n')}\r\n`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ventas_${desde}_${hasta}.csv"`,
      // El CSV depende de la sesión (tenant) — que no quede en ningún cache.
      'Cache-Control': 'no-store',
    },
  })
}

/** Número con 2 decimales y coma decimal, sin separador de miles. */
function numero(n: number): string {
  return n.toFixed(2).replace('.', ',')
}

/**
 * Entrecomilla si el valor tiene separador, comillas o saltos de línea. El `'`
 * delante de `=`, `+`, `-` y `@` neutraliza la fórmula: sin eso, un nombre de
 * cliente que arranque con `=` se ejecuta al abrir la planilla.
 */
function escapar(valor: string): string {
  const v = /^[=+\-@]/.test(valor) ? `'${valor}` : valor
  return /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}
