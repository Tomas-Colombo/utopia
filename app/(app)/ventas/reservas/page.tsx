import Link from 'next/link'
import { Topbar } from '@/components/shell/Topbar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { verifySession } from '@/lib/dal/session'
import { listReservas } from '@/lib/dal/reservas/reserva'
import { ReservasClient } from './ReservasClient'

export default async function ReservasPage() {
  const session = await verifySession()
  const rows = await listReservas()
  return (
    <>
      <Topbar
        title="Reservas"
        session={session}
        backHref="/ventas"
        actions={
          <Link href="/ventas/reservas/nueva">
            <Button size="sm">Nueva reserva</Button>
          </Link>
        }
      />
      <main className="flex-1 p-6 space-y-4">
        <ReservasClient rows={rows} />
      </main>
    </>
  )
}
