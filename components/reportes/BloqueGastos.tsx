import React from 'react'
import type { FinanzasPresupuestoRow } from '@/lib/types/reportes'
import { Card } from '@/components/ui/Card'

function formatMoney(value: number | null | undefined) {
  if (value == null) return '—'
  return Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value)
}

function parseMonthName(fechaStr: string) {
  if (!fechaStr) return ''
  const [a, m] = fechaStr.split('-')
  const date = new Date(Number(a), Number(m) - 1, 1)
  return Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(date)
}

interface BloqueGastosProps {
  presupuestos: FinanzasPresupuestoRow[]
  mesHasta: string
}

export function BloqueGastos({ presupuestos, mesHasta }: BloqueGastosProps) {
  const nombreMes = parseMonthName(mesHasta)
  
  if (!presupuestos || presupuestos.length === 0) {
    return (
      <Card as="section" padding="none" aria-labelledby="h2-gastos" className="overflow-hidden">
        <div className="p-4 border-b border-border bg-panel">
          <h2 id="h2-gastos" className="font-display text-lg">Gastos vs. Presupuesto</h2>
          <p className="text-sm text-muted">Correspondiente a {nombreMes}</p>
        </div>
        <div className="p-6 text-center text-muted">
          No hay gastos ni presupuestos cargados en este mes.
        </div>
      </Card>
    )
  }

  const totalGastado = presupuestos.reduce((sum, p) => sum + p.gastado, 0)
  const totalPresupuestado = presupuestos.reduce((sum, p) => sum + p.presupuesto_mensual, 0)

  return (
    <Card as="section" padding="none" aria-labelledby="h2-gastos" className="overflow-hidden">
      <div className="p-4 border-b border-border bg-panel flex flex-wrap justify-between items-end gap-2">
        <div>
          <h2 id="h2-gastos" className="font-display text-lg">Gastos vs. Presupuesto</h2>
          <p className="text-sm text-muted">Mes calendario completo: <span className="font-medium capitalize text-ink">{nombreMes}</span></p>
        </div>
        <div className="text-right hidden sm:block">
          <p className="text-xs text-muted mb-1">Total del mes</p>
          <p className="font-medium tabular-nums text-ink">{formatMoney(totalGastado)} <span className="text-muted font-normal text-xs">/ {formatMoney(totalPresupuestado)}</span></p>
        </div>
      </div>
      
      <div className="p-4 space-y-6">
        <div className="sm:hidden mb-2">
          <p className="text-xs text-muted mb-1">Total del mes</p>
          <p className="font-medium tabular-nums text-ink">{formatMoney(totalGastado)} <span className="text-muted font-normal text-xs">/ {formatMoney(totalPresupuestado)}</span></p>
        </div>

        <ul className="space-y-5">
          {presupuestos.map(p => {
            const isOverbudget = p.gastado > p.presupuesto_mensual && p.presupuesto_mensual > 0
            const progress = p.presupuesto_mensual > 0 
              ? Math.min(100, Math.max(0, (p.gastado / p.presupuesto_mensual) * 100))
              : (p.gastado > 0 ? 100 : 0)

            return (
              <li key={p.id_categoria_gasto} className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-ink">{p.nombre}</span>
                  <span className="tabular-nums">
                    {isOverbudget ? (
                      <span className="text-alerta-ink font-medium">{formatMoney(p.gastado)}</span>
                    ) : (
                      <span className="text-ink font-medium">{formatMoney(p.gastado)}</span>
                    )}
                    <span className="text-muted ml-1">/ {formatMoney(p.presupuesto_mensual)}</span>
                  </span>
                </div>
                
                {/* Progress bar */}
                <div className="h-2 w-full bg-panel rounded-full overflow-hidden" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
                  <div 
                    className={`h-full rounded-full transition-all duration-300 ${isOverbudget ? 'bg-alerta-ink' : 'bg-ink'}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </Card>
  )
}
