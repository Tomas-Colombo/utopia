import Link from 'next/link'
import { Topbar } from '@/components/shell/Topbar'
import { Button } from '@/components/ui/Button'
import { verifySession } from '@/lib/dal/session'
import { listClientes } from '@/lib/dal/clientes/cliente'
import { ClientesTable } from './ClientesTable'

export default async function ClientesPage(props: {
  searchParams: Promise<{ q?: string }>
}) {
  const session = await verifySession()
  const searchParams = await props.searchParams
  const rows = await listClientes({ search: searchParams.q })

  return (
    <>
      <Topbar
        title="Clientes"
        session={session}
        actions={
          <Link href="/clientes/nuevo">
            <Button size="sm">Nuevo cliente</Button>
          </Link>
        }
      />
      <main className="flex-1 p-6">
        <ClientesTable rows={rows} initialSearch={searchParams.q ?? ''} />
      </main>
    </>
  )
}
