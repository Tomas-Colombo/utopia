import { notFound } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { obtenerRevendedora } from '@/lib/dal/revendedoras'
import { EditarRevendedoraForm } from './EditarRevendedoraForm'

import Link from 'next/link'
import { Button } from '@/components/ui/Button'

export default async function RevendedoraPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession()
  const { id } = await params
  const revendedora = await obtenerRevendedora(session, id)
  
  if (!revendedora) notFound()

  return (
    <>
      <Topbar
        title={`${revendedora.nombre} ${revendedora.apellido}`}
        session={session}
        backHref="/revendedoras"
        actions={
          <Link href={`/revendedoras/${revendedora.id_revendedora}/consignaciones`}>
            <Button size="sm" variant="secondary">
              Consignaciones
            </Button>
          </Link>
        }
      />
      <main className="flex-1 p-6">
        <div className="max-w-xl rounded-lg border border-border bg-card p-6">
          <EditarRevendedoraForm revendedora={revendedora} />
        </div>
      </main>
    </>
  )
}
