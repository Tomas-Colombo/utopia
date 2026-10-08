import React from 'react'

interface VariacionBadgeProps {
  variacion: number | null
}

export function VariacionBadge({ variacion }: VariacionBadgeProps) {
  if (variacion === null || isNaN(variacion)) {
    return <span className="text-muted">Sin datos previos</span>
  }

  if (variacion === 0) {
    return <span className="text-muted">Igual que el período anterior</span>
  }

  const isPositive = variacion > 0
  const colorClass = isPositive ? 'text-ok' : 'text-alerta-ink'
  
  const abs = Math.abs(variacion)
  const flecha = isPositive ? '↑' : '↓'
  
  const pctStr = Intl.NumberFormat('es-AR', { 
    style: 'percent', 
    maximumFractionDigits: 1 
  }).format(abs)
  
  return (
    <span className={`inline-flex items-center gap-1 font-medium ${colorClass}`}>
      <span aria-hidden="true" className="font-bold">{flecha}</span>
      <span>
        {pctStr} {isPositive ? 'más' : 'menos'} que el período anterior
      </span>
    </span>
  )
}
