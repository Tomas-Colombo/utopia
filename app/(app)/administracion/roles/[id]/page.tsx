import { notFound } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { getRol } from '@/lib/dal/administracion/administracion'
import { EditarRolForm } from './EditarRolForm'

export default async function EditarRolPage(props: {
  params: Promise<{ id: string }>
}) {
  const session = await verifySession()
  const { id } = await props.params
  const rol = await getRol(id)
  if (!rol) notFound()
  return (
    <>
      <Topbar title={`Editar rol: ${rol.nombre}`} session={session} backHref="/administracion/roles" />
      <main className="flex-1 p-6">
        <div className="max-w-3xl">
          <EditarRolForm
            idRol={rol.id_rol}
            nombreInicial={rol.nombre}
            permisosIniciales={rol.permisos ?? {}}
          />
        </div>
      </main>
    </>
  )
}
