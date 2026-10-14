'use client'

import React from 'react'
import type { FinanzasResultadosRow } from '@/lib/types/reportes'

function formatMoney(value: number | null | undefined) {
  if (value == null) return '—'
  return Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })
    .format(value)
    .replace(/\u00A0/g, ' ')
}

interface BloqueGananciaProps {
  resultados: FinanzasResultadosRow
  tieneGastos: boolean
}

import { escapeCsvField, downloadCsv, csvNegative } from '@/lib/utils/csv'

export function BloqueGanancia({ resultados, tieneGastos }: BloqueGananciaProps) {
  const exportarCSV = () => {
    const csvRows = [
      'Concepto,Monto',
      `${escapeCsvField('Vendiste (neto)')},${resultados.ventas_netas}`,
      `${escapeCsvField('Menos costo de mercadería')},${csvNegative(resultados.costo_mercaderia)}`,
      `${escapeCsvField('Ganancia antes de gastos')},${resultados.ganancia_sobre_ventas}`
    ]
    
    if (tieneGastos) {
      csvRows.push(
        `${escapeCsvField('Menos gastos')},${csvNegative(resultados.gastos)}`,
        `${escapeCsvField('Ganancia final')},${resultados.ganancia_final}`
      )
    }

    downloadCsv(`ganancia-${resultados.mes}.csv`, csvRows.join('\n'))
  }

  return (
    <section aria-labelledby="h2-ganancia" className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="p-4 border-b border-border bg-panel flex justify-between items-center">
        <h2 id="h2-ganancia" className="font-display text-lg">Cómo se arma tu ganancia</h2>
        <button
          onClick={exportarCSV}
          className="h-9 px-3 text-sm font-medium border border-border rounded-md hover:bg-panel transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
        >
          Exportar CSV
        </button>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="sr-only">
            <tr>
              <th>Concepto</th>
              <th>Explicación</th>
              <th className="text-right">Monto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <tr>
              <td className="p-4 font-medium text-ink">Vendiste (neto)</td>
              <td className="p-4 text-muted hidden sm:table-cell">Ventas del período menos anulaciones</td>
              <td className="p-4 text-right font-medium tabular-nums">{formatMoney(resultados.ventas_netas)}</td>
            </tr>
            <tr>
              <td className="p-4 text-alerta-ink">Menos costo de mercadería</td>
              <td className="p-4 text-muted hidden sm:table-cell">Lo que te costaron los productos que vendiste</td>
              <td className="p-4 text-right text-alerta-ink tabular-nums">
                {resultados.costo_mercaderia > 0 ? '-' : ''}{formatMoney(resultados.costo_mercaderia)}
              </td>
            </tr>
            <tr className={tieneGastos ? 'bg-panel/50' : 'bg-panel font-medium text-base'}>
              <td className="p-4 text-ink">Ganancia antes de gastos</td>
              <td className="p-4 text-muted hidden sm:table-cell"></td>
              <td className="p-4 text-right tabular-nums">{formatMoney(resultados.ganancia_sobre_ventas)}</td>
            </tr>
            {tieneGastos && (
              <>
                <tr>
                  <td className="p-4 text-alerta-ink">Menos gastos</td>
                  <td className="p-4 text-muted hidden sm:table-cell">Egresos operativos cargados en el período</td>
                  <td className="p-4 text-right text-alerta-ink tabular-nums">
                    {resultados.gastos > 0 ? '-' : ''}{formatMoney(resultados.gastos)}
                  </td>
                </tr>
                <tr className="bg-panel font-bold text-base">
                  <td className="p-4 text-ink">Ganancia final</td>
                  <td className="p-4 text-muted hidden sm:table-cell">Lo que te quedó limpio</td>
                  <td className="p-4 text-right tabular-nums">{formatMoney(resultados.ganancia_final)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
