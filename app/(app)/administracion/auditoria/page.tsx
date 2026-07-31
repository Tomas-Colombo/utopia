import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import {
  listAuditoria,
  listEntidadesAuditoria,
} from '@/lib/dal/administracion/administracion'
import { AuditoriaView } from './AuditoriaView'

export default async function AuditoriaPage(props: {
  searchParams: Promise<{ entidad?: string; desde?: string; hasta?: string }>
}) {
  const session = await verifySession()
  const sp = await props.searchParams
  const [rows, entidades] = await Promise.all([
    listAuditoria({
      entidad: sp.entidad,
      desde: sp.desde ? new Date(sp.desde).toISOString() : undefined,
      hasta: sp.hasta
        ? new Date(new Date(sp.hasta).setHours(23, 59, 59, 999)).toISOString()
        : undefined,
      limit: 500,
    }),
    listEntidadesAuditoria(),
  ])

  return (
    <>
      <Topbar title="Auditoría" session={session} backHref="/administracion" />
      <main className="flex-1 p-6">
        <AuditoriaView
          rows={rows}
          entidades={entidades}
          filtros={{
            entidad: sp.entidad ?? '',
            desde: sp.desde ?? '',
            hasta: sp.hasta ?? '',
          }}
        />
      </main>
    </>
  )
}
