import { notFound } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import { Badge } from '@/components/ui/Badge'
import { verifySession } from '@/lib/dal/session'
import { getVentaConDetalle } from '@/lib/dal/ventas/venta'
import { getPerdidaIncobrableVenta, listCuotasPorVenta } from '@/lib/dal/cuotas/cuota'
import { VentaDetalleView } from './VentaDetalleView'

export default async function VentaDetallePage(props: {
  params: Promise<{ id: string }>
}) {
  const session = await verifySession()
  const { id } = await props.params
  const venta = await getVentaConDetalle(id)
  if (!venta) notFound()

  const cuotas = await listCuotasPorVenta(id)
  // La pérdida sólo se consulta si hay algo que perder: el SP recorre las
  // líneas y no tiene sentido pagarlo en cada venta al contado.
  const perdida = cuotas.some((c) => c.estado === 'incobrable')
    ? await getPerdidaIncobrableVenta(id)
    : null

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
        <VentaDetalleView venta={venta} cuotas={cuotas} perdida={perdida} />
      </main>
    </>
  )
}
