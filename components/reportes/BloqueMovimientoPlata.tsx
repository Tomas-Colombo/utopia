import React from 'react'
import type { FinanzasFlujoRow } from '@/lib/types/reportes'

function formatMoney(value: number | null | undefined) {
  if (value == null) return '—'
  return Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })
    .format(value)
    .replace(/\u00A0/g, ' ')
}

interface BloqueMovimientoPlataProps {
  flujo: FinanzasFlujoRow
  tieneGastos: boolean
}

export function BloqueMovimientoPlata({ flujo, tieneGastos }: BloqueMovimientoPlataProps) {
  const porAcreditarList = Object.entries(flujo.por_acreditar ?? {})
    .map(([cuenta, monto]) => ({ cuenta, monto }))
    .filter(x => x.monto > 0)

  return (
    <section aria-labelledby="h2-flujo" className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="p-4 border-b border-border bg-panel">
        <h2 id="h2-flujo" className="font-display text-lg">Movimiento de plata</h2>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="sr-only">
            <tr>
              <th>Concepto</th>
              <th>Detalle</th>
              <th className="text-right">Monto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <tr>
              <td className="p-4 font-medium text-ink">Cobrado</td>
              <td className="p-4 text-muted hidden sm:table-cell">Plata que entró (ventas y saldos)</td>
              <td className="p-4 text-right font-medium tabular-nums">{formatMoney(flujo.cobrado)}</td>
            </tr>
            {flujo.devuelto_clientes > 0 && (
              <tr>
                <td className="p-4 text-alerta-ink">Devuelto a clientes</td>
                <td className="p-4 text-muted hidden sm:table-cell">Reintegros por devoluciones o anulaciones</td>
                <td className="p-4 text-right text-alerta-ink tabular-nums">
                  -{formatMoney(flujo.devuelto_clientes)}
                </td>
              </tr>
            )}
            {flujo.costo_procesamiento > 0 && (
              <tr>
                <td className="p-4 text-alerta-ink">Comisiones y retenciones</td>
                <td className="p-4 text-muted hidden sm:table-cell">Costo de procesadores de pago</td>
                <td className="p-4 text-right text-alerta-ink tabular-nums">
                  -{formatMoney(flujo.costo_procesamiento)}
                </td>
              </tr>
            )}
            <tr className="bg-panel/30">
              <td className="p-4 text-ink">Compras de mercadería</td>
              <td className="p-4 text-muted hidden sm:table-cell">Se asumen pagadas al recibirlas</td>
              <td className="p-4 text-right tabular-nums">
                {flujo.compras_mercaderia > 0 ? '-' : ''}{formatMoney(flujo.compras_mercaderia)}
              </td>
            </tr>
            <tr>
              <td className="p-4 text-ink">Pagos a proveedores</td>
              <td className="p-4 text-muted hidden sm:table-cell">Rendiciones pagadas</td>
              <td className="p-4 text-right tabular-nums">
                {flujo.pagos_proveedores > 0 ? '-' : ''}{formatMoney(flujo.pagos_proveedores)}
              </td>
            </tr>
            {tieneGastos && (
              <tr>
                <td className="p-4 text-ink">Gastos operativos</td>
                <td className="p-4 text-muted hidden sm:table-cell">Pagos por gastos del negocio</td>
                <td className="p-4 text-right tabular-nums">
                  {flujo.gastos > 0 ? '-' : ''}{formatMoney(flujo.gastos)}
                </td>
              </tr>
            )}
            <tr className="bg-panel font-bold text-base border-b border-border">
              <td className="p-4 text-ink">Flujo neto del período</td>
              <td className="p-4 text-muted hidden sm:table-cell">Diferencia entre entradas y salidas</td>
              <td className="p-4 text-right tabular-nums">{formatMoney(flujo.flujo_neto)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {porAcreditarList.length > 0 && (
        <div className="p-4 bg-panel-2 border-t border-border">
          <h3 className="text-sm font-medium text-ink mb-2">Por acreditar de este período</h3>
          <ul className="space-y-1">
            {porAcreditarList.map(({ cuenta, monto }) => (
              <li key={cuenta} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{cuenta}</span>
                <span className="tabular-nums font-medium">{formatMoney(monto)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
