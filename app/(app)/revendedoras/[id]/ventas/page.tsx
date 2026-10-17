import { notFound } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import { requireModuleRole } from '@/lib/dal/guard'
import { verifySession } from '@/lib/dal/session'
import { obtenerRevendedora } from '@/lib/dal/revendedoras'
import { listVentasPaginado } from '@/lib/dal/ventas/venta'
import { RevendedoraTabs } from '../RevendedoraTabs'
import { RevendedoraVentasTable } from './RevendedoraVentasTable'
import { Card } from '@/components/ui/Card'

export default async function RevendedoraVentasPage(props: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const session = await verifySession()
  await requireModuleRole(session, 'revendedoras', 'ver')

  const { id } = await props.params
  const sp = await props.searchParams
  const page = Math.max(1, Number(sp.page) || 1)

  const revendedora = await obtenerRevendedora(session, id)
  if (!revendedora) notFound()

  const { rows, total } = await listVentasPaginado({
    idRevendedora: id,
    canal: 'revendedora',
    page,
    pageSize: 50,
  })

  return (
    <>
      <Topbar
        title={`Ventas · ${revendedora.nombre} ${revendedora.apellido}`}
        session={session}
        backHref={`/revendedoras/${id}`}
      />
      <main className="flex-1 p-6 space-y-6">
        <RevendedoraTabs idRevendedora={id} activeTab="ventas" />

        <Card padding="none" className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg">Historial de ventas</h2>
            <span className="text-sm text-muted">
              {total} venta{total === 1 ? '' : 's'}
            </span>
          </div>

          <RevendedoraVentasTable rows={rows} />
        </Card>
      </main>
    </>
  )
}
