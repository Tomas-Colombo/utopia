import Link from 'next/link'
import { Topbar } from '@/components/shell/Topbar'
import { Badge } from '@/components/ui/Badge'
import { AjusteInventarioAction } from '@/components/inventario/AjusteInventarioAction'
import { QrDisplay } from '@/components/inventario/QrDisplay'
import { verifySession } from '@/lib/dal/session'
import { findItemByQr, getItemConDetalle } from '@/lib/dal/inventario/item'
import type { EstadoItem } from '@/lib/types/inventario'
import { FichaActions } from './FichaActions'

const ESTADO_LABEL: Record<EstadoItem, string> = {
  disponible: 'Disponible',
  reservado: 'Reservado',
  vendido: 'Vendido',
  devuelto: 'Devuelto',
  devuelto_cliente: 'Devuelto por cliente',
  baja: 'Dado de baja',
}

const ESTADO_VARIANT: Record<EstadoItem, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  disponible: 'success',
  reservado: 'info',
  vendido: 'info',
  devuelto: 'neutral',
  devuelto_cliente: 'warning',
  baja: 'danger',
}

export default async function FichaItemPage(props: {
  params: Promise<{ qr: string }>
}) {
  const session = await verifySession()
  const { qr } = await props.params
  const decoded = decodeURIComponent(qr)

  const base = await findItemByQr(decoded)

  if (!base) {
    return (
      <>
        <Topbar title="Ítem no encontrado" session={session} backHref="/inventario/ficha" />
        <main className="flex-1 p-6">
          <div className="mx-auto max-w-md rounded-lg border border-border bg-card p-6 text-center">
            <p className="font-display text-lg mb-2">QR no reconocido</p>
            <p className="text-sm text-muted mb-4">
              No existe un ítem con el código <span className="font-mono">{decoded}</span> en
              este tenant.
            </p>
            <Link
              href="/inventario/ficha"
              className="inline-flex items-center rounded-md bg-accent-pink px-4 py-2 text-sm font-semibold text-sidebar"
            >
              Volver a escanear
            </Link>
          </div>
        </main>
      </>
    )
  }

  const detalle = await getItemConDetalle(base.id_item)
  if (!detalle) return null // RLS could hide between calls

  return (
    <>
      <Topbar title="Ficha de ítem" session={session} backHref="/inventario/ficha" />
      <main className="flex-1 p-6">
        <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-[280px_1fr]">
          {/* QR + estado */}
          <aside className="rounded-lg border border-border bg-card p-4">
            <QrDisplay value={detalle.qr_code} size={220} />
            <div className="mt-4 flex items-center justify-center">
              <Badge variant={ESTADO_VARIANT[detalle.estado_item]}>
                {ESTADO_LABEL[detalle.estado_item]}
              </Badge>
            </div>
          </aside>

          {/* Datos + acciones + historial */}
          <section className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="font-display text-xl">{detalle.producto.nombre}</h2>
              {detalle.producto.sku && (
                <div className="text-xs font-mono text-muted mt-1">
                  SKU: {detalle.producto.sku}
                </div>
              )}
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs uppercase font-mono text-muted">Categoría</div>
                  <div>{detalle.producto.categoria?.nombre ?? '—'}</div>
                </div>
                <div>
                  <div className="text-xs uppercase font-mono text-muted">Tipo ingreso</div>
                  <div className="capitalize">{detalle.tipo_ingreso}</div>
                </div>
                <div>
                  <div className="text-xs uppercase font-mono text-muted">Costo ingreso</div>
                  <div className="font-mono">
                    $ {Number(detalle.costo_ingreso).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase font-mono text-muted">Fecha ingreso</div>
                  <div>{new Date(detalle.fecha_ingreso).toLocaleDateString('es-AR')}</div>
                </div>
                {detalle.proveedor && (
                  <div className="col-span-2">
                    <div className="text-xs uppercase font-mono text-muted">Proveedor</div>
                    <div>{detalle.proveedor.nombre}</div>
                  </div>
                )}
              </div>
            </div>

            <FichaActions
              idItem={detalle.id_item}
              estadoActual={detalle.estado_item}
            />

            <div className="rounded-lg border border-border bg-card p-4 flex items-center justify-between">
              <div>
                <h3 className="font-display text-lg">Ajuste de inventario</h3>
                <p className="text-sm text-muted">
                  Diferencia entre stock del sistema y conteo real. Registra movimiento auditable.
                </p>
              </div>
              <AjusteInventarioAction
                idItem={detalle.id_item}
                estadoItem={detalle.estado_item}
              />
            </div>

            {/* Historial de movimientos */}
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="font-display text-lg mb-3">Historial</h3>
              {detalle.movimientos.length === 0 ? (
                <p className="text-sm text-muted">Sin movimientos.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {detalle.movimientos.map((m) => (
                    <li
                      key={m.id_movimiento}
                      className="flex items-start justify-between border-b border-border-2 pb-2 last:border-0"
                    >
                      <div>
                        <div className="font-mono text-xs uppercase text-muted">
                          {m.tipo_movimiento}
                        </div>
                        <div>
                          {m.estado_desde ?? '—'} → <b>{m.estado_hasta}</b>
                        </div>
                      </div>
                      <div className="text-xs text-muted">
                        {new Date(m.ts).toLocaleString('es-AR')}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </main>
    </>
  )
}
