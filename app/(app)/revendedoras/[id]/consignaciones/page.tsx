import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import { Button } from '@/components/ui/Button'
import { hasPermission, requireModuleRole } from '@/lib/dal/guard'
import { verifySession } from '@/lib/dal/session'
import { obtenerRevendedora, listConsignacionesRevendedora } from '@/lib/dal/revendedoras'
import { ConsignacionesRevendedoraTable } from './ConsignacionesRevendedoraTable'
import { RevendedoraTabs } from '../RevendedoraTabs'
import { Card } from '@/components/ui/Card'

export default async function ConsignacionesRevendedoraPage(props: {
  params: Promise<{ id: string }>
}) {
  const session = await verifySession()
  await requireModuleRole(session, 'revendedoras', 'ver')

  const { id } = await props.params
  const revendedora = await obtenerRevendedora(session, id)
  if (!revendedora) notFound()

  const consignaciones = await listConsignacionesRevendedora(id)
  const puedeCrear = hasPermission(session, 'revendedoras', 'crear')

  return (
    <>
      <Topbar
        title={`Consignaciones · ${revendedora.nombre} ${revendedora.apellido}`}
        session={session}
        backHref={`/revendedoras/${id}`}
        actions={
          puedeCrear && (
            <Link href={`/revendedoras/${id}/consignaciones/nueva`}>
              <Button size="sm">Nueva consignación</Button>
            </Link>
          )
        }
      />
      <main className="flex-1 p-4 sm:p-6 space-y-6">
        <RevendedoraTabs idRevendedora={id} activeTab="consignaciones" />
        <Card padding="none" className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg">Historial de consignaciones</h2>
            <span className="text-sm text-muted">
              {consignaciones.length} lote{consignaciones.length === 1 ? '' : 's'}
            </span>
          </div>

          {consignaciones.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <p className="font-display text-lg text-text">Sin consignaciones</p>
              <p className="text-sm text-muted">
                Esta revendedora aún no tiene lotes de mercadería consignados.
              </p>
              {puedeCrear && (
                <Link
                  href={`/revendedoras/${id}/consignaciones/nueva`}
                  className="rounded-md bg-block px-4 py-2 font-body text-sm font-semibold text-block-ink"
                >
                  Nueva consignación
                </Link>
              )}
            </div>
          ) : (
            <ConsignacionesRevendedoraTable
              idRevendedora={id}
              consignaciones={consignaciones}
            />
          )}
        </Card>
      </main>
    </>
  )
}
