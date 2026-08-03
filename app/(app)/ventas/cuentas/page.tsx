import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { listCuentasDestino } from '@/lib/dal/ventas/cuenta-destino'
import { CuentasView } from './CuentasView'

/**
 * Cuentas donde entra la plata de las ventas. Vive dentro de Ventas (no de
 * Administración) porque su permiso es el del módulo ventas y porque el
 * vendedor las elige al cobrar.
 */
export default async function CuentasPage() {
  const session = await verifySession()
  const cuentas = await listCuentasDestino()
  return (
    <>
      <Topbar title="Cuentas de cobro" session={session} backHref="/ventas" />
      <main className="flex-1 p-6">
        <CuentasView cuentas={cuentas} />
      </main>
    </>
  )
}
