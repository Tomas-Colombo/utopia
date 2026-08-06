import Link from 'next/link'
import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import {
  listAuditoria,
  listModulosTenant,
  listRoles,
  listUsuarios,
} from '@/lib/dal/administracion/administracion'
import { RolesModal } from './RolesModal'

function cardLink(c: { href: string; label: string; value: string }) {
  return (
    <Link
      key={c.href}
      href={c.href}
      className="rounded-lg border border-border bg-card p-5 hover:bg-card-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
    >
      <div className="text-sm text-muted">{c.label}</div>
      <div className="mt-1 font-display text-2xl">{c.value}</div>
    </Link>
  )
}

export default async function AdministracionHome() {
  const session = await verifySession()
  const [usuarios, roles, modulos, ultimasAcciones] = await Promise.all([
    listUsuarios(),
    listRoles(),
    listModulosTenant(),
    listAuditoria({ limit: 15 }),
  ])
  const modulosHab = modulos.filter((m) => m.habilitado).length

  // Roles no está acá: es un pop-up (`RolesModal`), no una ruta.
  const cards = [
    { href: '/administracion/usuarios', label: 'Usuarios', value: usuarios.length.toString() },
    { href: '/administracion/modulos', label: 'Módulos habilitados', value: `${modulosHab}/${modulos.length}` },
    { href: '/administracion/auditoria', label: 'Auditoría', value: 'Ver' },
  ]

  return (
    <>
      <Topbar title="Administración" session={session} />
      <main className="flex-1 p-6 space-y-6">
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {cards.slice(0, 1).map(cardLink)}
          <RolesModal roles={roles} />
          {cards.slice(1).map(cardLink)}
        </section>

        <section className="rounded-lg border border-border bg-card overflow-x-auto">
          <div className="border-b border-border px-4 py-3 flex items-center justify-between">
            <h3 className="font-display text-lg">Últimas acciones auditadas</h3>
            <Link href="/administracion/auditoria" className="text-sm text-pink-strong hover:underline">
              Ver historial completo
            </Link>
          </div>
          {ultimasAcciones.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted">Sin registros aún.</div>
          ) : (
            <ul className="divide-y divide-border-2 text-sm">
              {ultimasAcciones.map((a) => (
                <li key={a.id_auditoria} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs uppercase text-muted">
                      {a.entidad} · {a.accion}
                    </div>
                    <div className="text-sm">
                      {a.actor_nombre || a.actor_email || '(sistema)'}
                    </div>
                  </div>
                  <div className="text-xs text-muted whitespace-nowrap">
                    {new Date(a.ts).toLocaleString('es-AR')}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  )
}
