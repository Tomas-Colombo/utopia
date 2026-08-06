import Link from 'next/link'
import { Topbar } from '@/components/shell/Topbar'
import { Button } from '@/components/ui/Button'
import { Kpi } from '@/components/ui/Kpi'
import { hasPermission } from '@/lib/dal/guard'
import { verifySession } from '@/lib/dal/session'
import { listConsignaciones } from '@/lib/dal/consignaciones/consignacion'
import { listProveedoresActivos } from '@/lib/dal/inventario/proveedor'
import {
  esFechaValida,
  inicioDelDia,
  inicioDelDiaSiguiente,
  anioActual,
} from '@/lib/fechas'
import { type EstadoConsignacion } from '@/lib/types/consignaciones'
import { ConsignacionesFiltros } from './ConsignacionesFiltros'
import { ConsignacionesTableClient } from './ConsignacionesTableClient'

function esEstado(v: string | undefined): v is EstadoConsignacion {
  return v === 'activa' || v === 'cerrada'
}

/**
 * Listado de devoluciones a proveedor.
 *
 * Los tres filtros (período, proveedor, estado) viven en la URL y se aplican
 * en la QUERY, no en el render: las métricas de arriba se calculan sobre el
 * mismo recorte que la tabla de abajo. Sin params el período por defecto es el
 * año en curso — una devolución es un evento poco frecuente, un default de
 * "este mes" mostraría vacío la mayoría de los días.
 */
export default async function ConsignacionesPage(props: {
  searchParams: Promise<{
    desde?: string
    hasta?: string
    proveedor?: string
    estado?: string
  }>
}) {
  const session = await verifySession()
  const sp = await props.searchParams

  // Params inválidos o incompletos → año en curso. Nunca reventar por una URL
  // tipeada a mano.
  const porDefecto = anioActual()
  const desde = esFechaValida(sp.desde) ? sp.desde : porDefecto.desde
  const hastaCrudo = esFechaValida(sp.hasta) ? sp.hasta : porDefecto.hasta
  const hasta = hastaCrudo < desde ? desde : hastaCrudo
  const estado = esEstado(sp.estado) ? sp.estado : undefined
  const idProveedor = sp.proveedor || undefined

  const [rows, proveedores] = await Promise.all([
    listConsignaciones({
      estado,
      idProveedor,
      desde: inicioDelDia(desde),
      hastaExclusivo: inicioDelDiaSiguiente(hasta),
    }),
    listProveedoresActivos(),
  ])

  const activas = rows.filter((r) => r.estado === 'activa').length
  const pendientesTotales = rows.reduce((a, r) => a + r.pendientes, 0)
  const devueltosTotales = rows.reduce((a, r) => a + r.devueltos, 0)

  const hayFiltroExtra = Boolean(estado || idProveedor)

  // URL del listado CON los filtros puestos: los detalles a los que salta la
  // tabla la reciben en `?from=` y el botón volver devuelve a esta misma vista.
  const volverHref = (() => {
    const qs = new URLSearchParams({ desde, hasta })
    if (idProveedor) qs.set('proveedor', idProveedor)
    if (estado) qs.set('estado', estado)
    return `/consignaciones?${qs.toString()}`
  })()

  return (
    <>
      <Topbar
        title="Devoluciones a proveedor"
        session={session}
        actions={
          <Link href="/consignaciones/nueva">
            <Button size="sm">Nueva devolución</Button>
          </Link>
        }
      />
      <main className="flex-1 p-6 space-y-6">
        <ConsignacionesFiltros
          desde={desde}
          hasta={hasta}
          idProveedor={idProveedor ?? ''}
          estado={estado ?? ''}
          proveedores={proveedores.map((p) => ({ id: p.id_proveedor, nombre: p.nombre }))}
        />

        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi label="Lotes en el filtro" value={rows.length.toString()} />
          <Kpi label="Activos" value={activas.toString()} />
          <Kpi
            label="Ítems pendientes"
            value={pendientesTotales.toString()}
            variant={pendientesTotales > 0 ? 'alert' : 'default'}
          />
          <Kpi label="Ítems devueltos" value={devueltosTotales.toString()} />
        </section>

        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
            <p className="font-display text-lg mb-2">
              {hayFiltroExtra || sp.desde || sp.hasta
                ? 'Sin devoluciones con estos filtros'
                : 'Sin consignaciones'}
            </p>
            <p className="text-sm text-muted mb-4">
              {hayFiltroExtra || sp.desde || sp.hasta
                ? 'Probá ampliar el período o quitar el filtro de proveedor o estado.'
                : 'Cuando decidís devolver mercadería a un proveedor, creá un lote de consignación.'}
            </p>
            <Link
              href="/consignaciones/nueva"
              className="inline-flex items-center rounded-md bg-accent-pink px-4 py-2 text-sm font-semibold text-sidebar"
            >
              Nueva devolución
            </Link>
          </div>
        ) : (
          <ConsignacionesTableClient
            rows={rows}
            puedeEliminar={hasPermission(session, 'consignaciones', 'eliminar')}
            volverHref={volverHref}
          />
        )}
      </main>
    </>
  )
}
