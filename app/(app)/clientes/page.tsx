import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { listClientesPaginado } from '@/lib/dal/clientes/cliente'
import { ORDEN_CLIENTES_LABEL, type OrdenClientes } from '@/lib/types/ventas'
import { ClientesTable } from './ClientesTable'
import { NuevoClienteModalButton } from './NuevoClienteModalButton'

const PAGE_SIZE = 25

/** Sólo se acepta un orden del catálogo: el resto cae al default. */
function parseOrden(raw: string | undefined): OrdenClientes {
  return raw && raw in ORDEN_CLIENTES_LABEL ? (raw as OrdenClientes) : 'apellido_asc'
}

export default async function ClientesPage(props: {
  searchParams: Promise<{ q?: string; orden?: string; page?: string }>
}) {
  const session = await verifySession()
  const searchParams = await props.searchParams
  const orden = parseOrden(searchParams.orden)
  const page = Math.max(1, Number(searchParams.page ?? '1') || 1)

  const { rows, total } = await listClientesPaginado({
    page,
    pageSize: PAGE_SIZE,
    search: searchParams.q,
    orden,
  })

  return (
    <>
      <Topbar
        title="Clientes"
        session={session}
        actions={<NuevoClienteModalButton />}
      />
      <main className="flex-1 p-6">
        <ClientesTable
          rows={rows}
          initialSearch={searchParams.q ?? ''}
          orden={orden}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
        />
      </main>
    </>
  )
}
