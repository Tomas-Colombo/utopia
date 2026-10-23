import { notFound } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import { hasPermission, requireModuleRole } from '@/lib/dal/guard'
import { verifySession } from '@/lib/dal/session'
import { getConsignacionRevendedoraConDetalle } from '@/lib/dal/revendedoras'
import { ConsignacionRevendedoraDetalleView } from './ConsignacionRevendedoraDetalleView'

export default async function ConsignacionRevendedoraDetallePage(props: {
  params: Promise<{ id: string; idConsignacion: string }>
}) {
  const session = await verifySession()
  await requireModuleRole(session, 'revendedoras', 'ver')

  const { id, idConsignacion } = await props.params
  const cons = await getConsignacionRevendedoraConDetalle(idConsignacion)
  if (!cons || cons.id_revendedora !== id) notFound()

  const puedeCrear = hasPermission(session, 'revendedoras', 'crear')
  const puedeEditar = hasPermission(session, 'revendedoras', 'editar')
  const puedeEliminar = hasPermission(session, 'revendedoras', 'eliminar')

  return (
    <>
      <Topbar
        title={`Detalle de consignación · ${cons.revendedora.nombre} ${cons.revendedora.apellido}`}
        session={session}
        backHref={`/revendedoras/${id}/consignaciones`}
      />
      <main className="flex-1 p-4 sm:p-6">
        <ConsignacionRevendedoraDetalleView
          cons={cons}
          puedeCrear={puedeCrear}
          puedeEditar={puedeEditar}
          puedeEliminar={puedeEliminar}
        />
      </main>
    </>
  )
}
