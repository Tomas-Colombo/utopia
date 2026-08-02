import { notFound } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import { Badge } from '@/components/ui/Badge'
import { verifySession } from '@/lib/dal/session'
import {
  getConsignacionConDetalle,
  listItemsElegiblesConsignacion,
} from '@/lib/dal/consignaciones/consignacion'
import {
  ESTADO_CONSIGNACION_LABEL,
  type EstadoConsignacion,
} from '@/lib/types/consignaciones'
import { ConsignacionDetalleView } from './ConsignacionDetalleView'

const VARIANT: Record<EstadoConsignacion, 'success' | 'neutral'> = {
  activa: 'success',
  cerrada: 'neutral',
}

export default async function ConsignacionDetallePage(props: {
  params: Promise<{ id: string }>
}) {
  const session = await verifySession()
  const { id } = await props.params
  const cons = await getConsignacionConDetalle(id)
  if (!cons) notFound()

  // Ítems que se pueden apartar en este lote — alimentan el buscador con
  // sugerencias por nombre/SKU/QR. Solo hace falta con el lote abierto.
  const itemsElegibles =
    cons.estado === 'cerrada' || !cons.proveedor
      ? []
      : await listItemsElegiblesConsignacion(cons.proveedor.id_proveedor)

  return (
    <>
      <Topbar
        title={`Consignación ${new Date(cons.fecha).toLocaleDateString('es-AR')}`}
        session={session}
        backHref="/consignaciones"
        actions={
          <Badge variant={VARIANT[cons.estado]}>{ESTADO_CONSIGNACION_LABEL[cons.estado]}</Badge>
        }
      />
      <main className="flex-1 p-6">
        <ConsignacionDetalleView cons={cons} itemsElegibles={itemsElegibles} />
      </main>
    </>
  )
}
