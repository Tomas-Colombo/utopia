import Link from 'next/link'
import { Topbar } from '@/components/shell/Topbar'
import { Button } from '@/components/ui/Button'
import { verifySession } from '@/lib/dal/session'
import { listReglasPrecio } from '@/lib/dal/precios/regla'
import { ReglasView } from './ReglasView'

export default async function ReglasPage() {
  const session = await verifySession()
  const rows = await listReglasPrecio({ incluirBaja: false })

  return (
    <>
      <Topbar
        title="Reglas de precios"
        session={session}
        actions={
          <Link href="/precios/reglas/nueva">
            <Button size="sm">Nueva regla</Button>
          </Link>
        }
      />
      <main className="flex-1 p-6">
        <ReglasView initial={rows} />
      </main>
    </>
  )
}
