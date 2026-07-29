import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { listCategoriasGasto } from '@/lib/dal/gastos/gasto'
import { PresupuestosView } from './PresupuestosView'

export default async function PresupuestosPage() {
  const session = await verifySession()
  const cats = await listCategoriasGasto()
  return (
    <>
      <Topbar title="Presupuestos por categoría" session={session} />
      <main className="flex-1 p-6">
        <PresupuestosView
          initial={cats.map((c) => ({
            id: c.id_categoria_gasto,
            nombre: c.nombre,
            presupuesto: c.presupuesto_mensual,
          }))}
        />
      </main>
    </>
  )
}
