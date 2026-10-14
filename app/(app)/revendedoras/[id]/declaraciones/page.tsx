import { notFound } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { requireModuleRole } from '@/lib/dal/guard'
import { obtenerRevendedora } from '@/lib/dal/revendedoras'
import { RevendedoraTabs } from '../RevendedoraTabs'

interface PageProps {
  params: Promise<{ id: string }>
}

export const metadata = {
  title: 'Declaraciones | Revendedoras | Utopía',
}

export default async function DeclaracionesRevendedoraPage(props: PageProps) {
  const session = await verifySession()
  await requireModuleRole(session, 'revendedoras', 'ver')

  const { id } = await props.params
  const revendedora = await obtenerRevendedora(session, id)
  if (!revendedora) notFound()

  return (
    <>
      <Topbar
        title={`${revendedora.nombre} ${revendedora.apellido}`}
        session={session}
        backHref="/revendedoras"
      />
      <main className="flex-1 p-6 space-y-6 max-w-5xl">
        <RevendedoraTabs idRevendedora={revendedora.id_revendedora} activeTab="declaraciones" />

        <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
          <p className="font-display text-lg mb-2">Declaraciones de venta</p>
          <p className="text-sm text-muted max-w-md mx-auto">
            Las declaraciones de venta de la revendedora estarán disponibles en el Slice 9b. Desde
            aquí se podrán revisar y confirmar las ventas autodeclaradas por las revendedoras desde su
            portal.
          </p>
        </div>
      </main>
    </>
  )
}
