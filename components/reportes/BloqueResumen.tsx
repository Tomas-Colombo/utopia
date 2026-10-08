import React from 'react'
import { Kpi } from '@/components/ui/Kpi'
import { VariacionBadge } from './VariacionBadge'
import type { FinanzasResultadosRow, FinanzasFlujoRow, FinanzasPosicion } from '@/lib/types/reportes'

function formatMoney(value: number | null | undefined) {
  if (value == null) return '—'
  return Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })
    .format(value)
    .replace(/\u00A0/g, ' ')
}

function variacionPct(actual: number, previo: number | null): number | null {
  if (previo === null || previo === 0) return null
  return (actual - previo) / Math.abs(previo)
}

interface BloqueResumenProps {
  resultados: FinanzasResultadosRow
  resultadosPrev: FinanzasResultadosRow | null
  flujo: FinanzasFlujoRow
  flujoPrev: FinanzasFlujoRow | null
  posicion: FinanzasPosicion | null
  tieneGastos: boolean
}

export function BloqueResumen({
  resultados,
  resultadosPrev,
  flujo,
  flujoPrev,
  posicion,
  tieneGastos
}: BloqueResumenProps) {
  // Vendiste (ventas_netas)
  const varVentas = resultadosPrev ? variacionPct(resultados.ventas_netas, resultadosPrev.ventas_netas) : null
  
  // Te quedó de ganancia (ganancia_final si gastos, ganancia_sobre_ventas si no)
  const gananciaActual = tieneGastos ? resultados.ganancia_final : resultados.ganancia_sobre_ventas
  const gananciaPrev = resultadosPrev ? (tieneGastos ? resultadosPrev.ganancia_final : resultadosPrev.ganancia_sobre_ventas) : null
  const varGanancia = gananciaPrev !== null ? variacionPct(gananciaActual, gananciaPrev) : null

  // Entró a caja (neto_cobros)
  const varCobros = flujoPrev ? variacionPct(flujo.neto_cobros, flujoPrev.neto_cobros) : null

  // Te deben (por_cobrar)
  const porCobrar = posicion?.por_cobrar?.a_cobrar ?? null
  // Cuentas por cobrar es un stock a la fecha, no tiene un "previo" en la arquitectura actual.
  const varCobrar = null

  return (
    <section aria-labelledby="h2-resumen" className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
      <h2 id="h2-resumen" className="sr-only">Resumen de ventas y caja</h2>
      
      <Kpi 
        label="Vendiste" 
        value={formatMoney(resultados.ventas_netas)}
        sub={<VariacionBadge variacion={varVentas} />}
      />
      <Kpi 
        label={tieneGastos ? "Te quedó de ganancia" : "Ganancia (antes de gastos)"}
        value={formatMoney(gananciaActual)}
        sub={<VariacionBadge variacion={varGanancia} />}
      />
      <Kpi 
        label="Entró a caja" 
        value={formatMoney(flujo.neto_cobros)}
        sub={<VariacionBadge variacion={varCobros} />}
      />
      <Kpi 
        label="Te deben" 
        value={formatMoney(porCobrar)}
        sub={<VariacionBadge variacion={varCobrar} />}
        tone="muted"
      />
    </section>
  )
}
