import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { listProveedoresActivos } from '@/lib/dal/inventario/proveedor'
import { previewRendicion } from '@/lib/dal/rendiciones/rendicion'
import { NuevaRendicionView } from './NuevaRendicionView'

export default async function NuevaRendicionPage(props: {
  searchParams: Promise<{ prov?: string }>
}) {
  const session = await verifySession()
  const searchParams = await props.searchParams
  const proveedores = await listProveedoresActivos()
  const idProv = searchParams.prov ?? ''
  const preview = idProv ? await previewRendicion(idProv) : []

  return (
    <>
      <Topbar title="Generar rendición" session={session} />
      <main className="flex-1 p-6">
        <NuevaRendicionView
          proveedores={proveedores.map((p) => ({
            id: p.id_proveedor,
            nombre: p.nombre,
            tipo: p.tipo,
          }))}
          idProvSeleccionado={idProv}
          lineas={preview}
        />
      </main>
    </>
  )
}
