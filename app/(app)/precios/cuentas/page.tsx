import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { listCuentasDestinoPaginado } from '@/lib/dal/ventas/cuenta-destino'
import { listArancelesCobro } from '@/lib/dal/ventas/arancel'
import { listPlanesCuotas } from '@/lib/dal/precios/cuotas'
import { listRecargosCuotas } from '@/lib/dal/precios/recargo'
import { CuentasView } from './CuentasView'

const PAGE_SIZE = 20

/**
 * Cuentas donde entra la plata de las ventas. Vive dentro de Precios (módulo
 * `precios`) porque configurar una cuenta y su tarifario es una decisión de
 * precio, no del mostrador: el vendedor ELIGE la cuenta al cobrar, pero esas
 * opciones se las carga `/ventas/nueva` por su cuenta, sin pasar por acá.
 *
 * Desde 00057 cada cuenta lleva además su tarifario: cuánto retiene el
 * procesador y en cuántos días acredita. Ese arancel es la contracara del
 * recargo por cuotas, y por eso los dos viven en esta sección.
 */
export default async function CuentasPage(props: {
  searchParams: Promise<{ page?: string }>
}) {
  const session = await verifySession()
  const sp = await props.searchParams
  const page = Math.max(1, Number(sp.page ?? '1') || 1)

  const [{ rows, total }, aranceles, planesCuotas, recargos] = await Promise.all([
    listCuentasDestinoPaginado({ page, pageSize: PAGE_SIZE }),
    listArancelesCobro(),
    listPlanesCuotas({ soloActivos: true }),
    listRecargosCuotas(),
  ])

  return (
    <>
      <Topbar title="Cuentas y recargos" session={session} backHref="/precios" />
      <main className="flex-1 p-6">
        <CuentasView
          cuentas={rows}
          aranceles={aranceles}
          planesCuotas={planesCuotas}
          recargos={recargos}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
        />
      </main>
    </>
  )
}
