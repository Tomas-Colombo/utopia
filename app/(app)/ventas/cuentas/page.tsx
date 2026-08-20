import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { listCuentasDestinoPaginado } from '@/lib/dal/ventas/cuenta-destino'
import { listArancelesCobro } from '@/lib/dal/ventas/arancel'
import { listPlanesCuotas } from '@/lib/dal/precios/cuotas'
import { CuentasView } from './CuentasView'

const PAGE_SIZE = 20

/**
 * Cuentas donde entra la plata de las ventas. Vive dentro de Ventas (no de
 * Administración) porque su permiso es el del módulo ventas y porque el
 * vendedor las elige al cobrar.
 *
 * Desde 00057 cada cuenta lleva además su tarifario: cuánto retiene el
 * procesador y en cuántos días acredita.
 */
export default async function CuentasPage(props: {
  searchParams: Promise<{ page?: string }>
}) {
  const session = await verifySession()
  const sp = await props.searchParams
  const page = Math.max(1, Number(sp.page ?? '1') || 1)

  const [{ rows, total }, aranceles, planesCuotas] = await Promise.all([
    listCuentasDestinoPaginado({ page, pageSize: PAGE_SIZE }),
    listArancelesCobro(),
    listPlanesCuotas({ soloActivos: true }),
  ])

  return (
    <>
      <Topbar title="Cuentas de cobro" session={session} backHref="/ventas" />
      <main className="flex-1 p-6">
        <CuentasView
          cuentas={rows}
          aranceles={aranceles}
          planesCuotas={planesCuotas}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
        />
      </main>
    </>
  )
}
