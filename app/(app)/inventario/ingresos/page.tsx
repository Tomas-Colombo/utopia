import Link from 'next/link'
import { Topbar } from '@/components/shell/Topbar'
import { Button } from '@/components/ui/Button'
import { verifySession } from '@/lib/dal/session'
import { INGRESOS_PAGE_SIZE, listIngresosConResumen } from '@/lib/dal/inventario/ingreso'
import { IngresosTable } from './IngresosTable'

export default async function IngresosPage(props: {
  searchParams: Promise<{ page?: string }>
}) {
  const session = await verifySession()
  const searchParams = await props.searchParams
  const page = Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1)
  const { rows, total } = await listIngresosConResumen({ page, pageSize: INGRESOS_PAGE_SIZE })

  return (
    <>
      <Topbar
        title="Ingresos de mercadería"
        session={session}
        backHref="/inventario"
        actions={
          <Link href="/inventario/ingresos/nuevo">
            <Button size="sm">Nuevo ingreso</Button>
          </Link>
        }
      />
      <main className="flex-1 p-6">
        <IngresosTable key={page} initial={rows} page={page} pageSize={INGRESOS_PAGE_SIZE} total={total} />
      </main>
    </>
  )
}
