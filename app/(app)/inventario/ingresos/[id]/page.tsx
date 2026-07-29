import { notFound } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import { Badge } from '@/components/ui/Badge'
import { verifySession } from '@/lib/dal/session'
import { getIngreso } from '@/lib/dal/inventario/ingreso'
import { listProductosConDetalle } from '@/lib/dal/inventario/producto'
import { IngresoDetalleView } from './IngresoDetalleView'

export default async function IngresoDetallePage(props: {
  params: Promise<{ id: string }>
}) {
  const session = await verifySession()
  const { id } = await props.params
  const ingreso = await getIngreso(id)
  if (!ingreso) notFound()

  const productos = await listProductosConDetalle({ soloActivos: true })

  return (
    <>
      <Topbar
        title={`Ingreso ${new Date(ingreso.fecha).toLocaleDateString('es-AR')}`}
        session={session}
        actions={
          <Badge variant={ingreso.confirmado ? 'success' : 'neutral'}>
            {ingreso.confirmado ? 'Confirmado' : 'Borrador'}
          </Badge>
        }
      />
      <main className="flex-1 p-6">
        <IngresoDetalleView ingreso={ingreso} productos={productos} />
      </main>
    </>
  )
}
