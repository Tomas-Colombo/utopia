import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { listModulosTenant } from '@/lib/dal/administracion/administracion'
import { ModulosView } from './ModulosView'

export default async function ModulosAdminPage() {
  const session = await verifySession()
  const modulos = await listModulosTenant()
  return (
    <>
      <Topbar title="Módulos del tenant" session={session} />
      <main className="flex-1 p-6">
        <ModulosView
          initial={modulos.map((m) => ({
            id: m.id_modulo,
            codigo: m.codigo,
            nombre: m.nombre,
            habilitado: m.habilitado,
          }))}
        />
      </main>
    </>
  )
}
