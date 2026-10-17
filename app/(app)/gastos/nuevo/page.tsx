import { redirect } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { listCategoriasGasto } from '@/lib/dal/gastos/gasto'
import { NuevoGastoForm } from './NuevoGastoForm'
import { Card } from '@/components/ui/Card'

export default async function NuevoGastoPage() {
  const session = await verifySession()
  const cats = await listCategoriasGasto({ soloActivas: true })
  if (cats.length === 0) redirect('/gastos/presupuestos?e=needs-categorias')
  return (
    <>
      <Topbar title="Nuevo gasto" session={session} backHref="/gastos" />
      <main className="flex-1 p-6">
        <Card padding="none" className="max-w-xl p-6">
          <NuevoGastoForm
            categorias={cats.map((c) => ({ id: c.id_categoria_gasto, nombre: c.nombre }))}
          />
        </Card>
      </main>
    </>
  )
}
