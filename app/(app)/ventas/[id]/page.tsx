import { notFound } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import { Badge } from '@/components/ui/Badge'
import { verifySession } from '@/lib/dal/session'
import { getVentaConDetalle } from '@/lib/dal/ventas/venta'
import { VentaDetalleView } from './VentaDetalleView'

export default async function VentaDetallePage(props: {
  params: Promise<{ id: string }>
}) {
  const session = await verifySession()
  const { id } = await props.params
  const venta = await getVentaConDetalle(id)
  if (!venta) notFound()

  return (
    <>
      <Topbar
        title={`Venta ${new Date(venta.fecha).toLocaleString('es-AR')}`}
        session={session}
        backHref="/ventas"
        actions={
          <Badge variant={venta.estado_venta === 'anulada' ? 'danger' : 'success'}>
            {venta.estado_venta === 'anulada' ? 'Anulada' : 'Registrada'}
          </Badge>
        }
      />
      <main className="flex-1 p-6">
        <VentaDetalleView venta={venta} />
      </main>
    </>
  )
}
