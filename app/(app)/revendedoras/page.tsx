import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { hasPermission } from '@/lib/dal/guard'
import { obtenerPanelRevendedoras } from '@/lib/dal/revendedoras'
import { panelRevendedorasQuerySchema } from '@/lib/validation/revendedoras'
import { RevendedorasPanelView } from './RevendedorasPanelView'

export const metadata = {
  title: 'Revendedoras | Utopía',
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function RevendedorasPage(props: PageProps) {
  const session = await verifySession()
  const rawParams = await props.searchParams

  const parsed = panelRevendedorasQuerySchema.safeParse(rawParams)
  const query = parsed.success
    ? parsed.data
    : panelRevendedorasQuerySchema.parse({})

  const limit = 25
  const offset = (query.page - 1) * limit

  const res = await obtenerPanelRevendedoras({
    desde: query.desde,
    hasta: query.hasta,
    estado: query.estado,
    cuenta: query.cuenta,
    q: query.q,
    orden: query.orden,
    limit,
    offset,
  })

  const panelData = res.ok
    ? res.data
    : {
        totales: {
          en_poder: 0,
          en_local: 0,
          adeudado_total: 0,
          liquidaciones_pendientes_monto: 0,
          liquidaciones_pendientes_cant: 0,
        },
        revendedoras: [],
        total: 0,
      }

  const canCreate = hasPermission(session, 'revendedoras', 'crear')

  return (
    <>
      <Topbar title="Revendedoras" session={session} />
      <main className="flex-1 p-6">
        <RevendedorasPanelView
          data={panelData.revendedoras}
          totales={panelData.totales}
          total={panelData.total}
          canCreate={canCreate}
          filtros={{
            desde: query.desde,
            hasta: query.hasta,
            estado: query.estado,
            cuenta: query.cuenta,
            q: query.q,
            orden: query.orden,
            page: query.page,
          }}
        />
      </main>
    </>
  )
}
