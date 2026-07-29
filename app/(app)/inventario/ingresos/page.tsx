import Link from 'next/link'
import { Topbar } from '@/components/shell/Topbar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { verifySession } from '@/lib/dal/session'
import { listIngresosConResumen } from '@/lib/dal/inventario/ingreso'

export default async function IngresosPage() {
  const session = await verifySession()
  const rows = await listIngresosConResumen()

  return (
    <>
      <Topbar
        title="Ingresos de mercadería"
        session={session}
        actions={
          <Link href="/inventario/ingresos/nuevo">
            <Button size="sm">Nuevo ingreso</Button>
          </Link>
        }
      />
      <main className="flex-1 p-6">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
            <p className="font-display text-lg mb-2">Sin ingresos registrados</p>
            <p className="text-sm text-muted mb-4">
              Registrá el primer ingreso de mercadería (compra o consignación).
            </p>
            <Link
              href="/inventario/ingresos/nuevo"
              className="inline-flex items-center rounded-md bg-accent-pink px-4 py-2 text-sm font-semibold text-sidebar"
            >
              Nuevo ingreso
            </Link>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Proveedor</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Remito</th>
                  <th className="px-4 py-3 text-right">Líneas</th>
                  <th className="px-4 py-3 text-right">Unidades</th>
                  <th className="px-4 py-3 text-right">Costo total</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id_ingreso} className="border-b border-border-2">
                    <td className="px-4 py-3">
                      {new Date(r.fecha).toLocaleDateString('es-AR')}
                    </td>
                    <td className="px-4 py-3">{r.proveedor?.nombre ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={r.tipo_ingreso === 'compra' ? 'info' : 'warning'}>
                        {r.tipo_ingreso}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{r.numero_remito ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-mono">{r.total_lineas}</td>
                    <td className="px-4 py-3 text-right font-mono">{r.total_cantidad}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      $ {r.total_costo.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={r.confirmado ? 'success' : 'neutral'}>
                        {r.confirmado ? 'Confirmado' : 'Borrador'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/inventario/ingresos/${r.id_ingreso}`}
                        className="text-sm text-pink-strong hover:underline"
                      >
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  )
}
