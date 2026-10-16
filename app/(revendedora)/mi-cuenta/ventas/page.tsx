import { verifySession } from '@/lib/dal/session'
import { listarMisVentas } from '@/lib/dal/revendedoras'
import { formatearMoneda } from '@/lib/utils/moneda'

export const metadata = {
  title: 'Mis ventas | Revendedoras',
}

export default async function MisVentasPage() {
  const session = await verifySession()
  const res = await listarMisVentas(session, { limit: 100, offset: 0 })

  if (!res.ok) {
    return (
      <div className="p-6 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive">
        <p className="font-medium">No se pudieron cargar tus ventas.</p>
      </div>
    )
  }

  const ventas = res.data

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold font-display tracking-tight">Prendas vendidas</h1>
          <p className="text-sm text-muted">
            Detalle por prenda de las ventas registradas y confirmadas a tu nombre.
          </p>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-accent/10 text-accent">
          {ventas.length} {ventas.length === 1 ? 'prenda' : 'prendas'}
        </span>
      </div>

      {ventas.length === 0 ? (
        <div className="p-8 text-center rounded-xl border border-dashed border-border bg-card">
          <p className="text-muted text-sm">No tenés prendas vendidas registradas todavía.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {ventas.map((v) => (
            <div
              key={v.id_detalle_venta}
              className="p-4 rounded-xl border border-border bg-card shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-base">
                    {v.descripcion}
                  </span>
                  {v.talle && (
                    <span className="text-xs px-2 py-0.5 rounded bg-muted/10 font-medium">
                      Talle: {v.talle}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted">
                  <span>Precio: <strong className="text-foreground">{formatearMoneda(v.precio_venta)}</strong></span>
                  <span>·</span>
                  <span>Fecha: {new Date(v.fecha_venta).toLocaleDateString('es-AR')}</span>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-2 sm:pt-0 border-border/50">
                <div className="text-left sm:text-right">
                  <div className="text-xs text-muted">Tu comisión</div>
                  <div className="text-sm font-bold text-accent">
                    {formatearMoneda(v.comision_total)}
                  </div>
                </div>

                <div>
                  {v.liquidada ? (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      Liquidada
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      Pendiente de liquidar
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
