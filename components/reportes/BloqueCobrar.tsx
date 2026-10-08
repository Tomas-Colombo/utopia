import React from 'react'
import Link from 'next/link'
import type { CuentasPorCobrar } from '@/lib/types/reportes'

function formatMoney(value: number | null | undefined) {
  if (value == null) return '—'
  return Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value)
}

interface BloqueCobrarProps {
  porCobrar: CuentasPorCobrar | null
  puedeVerVentas: boolean
}

export function BloqueCobrar({ porCobrar, puedeVerVentas }: BloqueCobrarProps) {
  if (!porCobrar) {
    return null
  }

  const tieneVencido = porCobrar.vencido > 0

  return (
    <section aria-labelledby="h2-cobrar" className="rounded-lg border border-border bg-card overflow-hidden h-full flex flex-col">
      <div className="p-4 border-b border-border bg-panel flex justify-between items-center">
        <h2 id="h2-cobrar" className="font-display text-lg">Lo que te deben</h2>
      </div>
      
      <div className="p-6 flex-1 flex flex-col justify-center">
        <div className="mb-6">
          <p className="text-sm font-medium text-muted uppercase tracking-wider mb-1">Total a cobrar</p>
          <p className="font-display text-4xl tabular-nums text-ink leading-none">{formatMoney(porCobrar.a_cobrar)}</p>
          <p className="text-sm text-muted mt-2">
            Repartido entre <span className="font-medium text-ink">{porCobrar.clientes_con_deuda}</span> clientes con cuotas pendientes.
          </p>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-panel-2 p-3 rounded-lg border border-border">
            <p className="text-xs text-muted mb-1">Vence este mes</p>
            <p className="font-medium tabular-nums text-ink">{formatMoney(porCobrar.vence_este_mes)}</p>
          </div>
          
          <div className={`p-3 rounded-lg border ${tieneVencido ? 'bg-alerta-bg border-alerta-ink/20' : 'bg-panel-2 border-border'}`}>
            <p className={`text-xs mb-1 ${tieneVencido ? 'text-alerta-ink font-medium' : 'text-muted'}`}>Ya vencido</p>
            <p className={`font-medium tabular-nums ${tieneVencido ? 'text-alerta-ink' : 'text-ink'}`}>
              {formatMoney(porCobrar.vencido)}
            </p>
            {tieneVencido && puedeVerVentas && (
              <div className="mt-2">
                <Link 
                  href="/cuotas?estado=vencidas" 
                  className="text-xs font-medium underline text-alerta-ink hover:text-alerta-ink/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rosa rounded"
                >
                  Ver cuotas vencidas →
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
