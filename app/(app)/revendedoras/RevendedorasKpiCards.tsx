import type { TotalesPanelRevendedoras } from '@/lib/types/revendedoras'

interface RevendedorasKpiCardsProps {
  totales: TotalesPanelRevendedoras
}

export function RevendedorasKpiCards({ totales }: RevendedorasKpiCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-xs font-medium text-muted uppercase tracking-wider">
          Mercadería en revendedoras
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-bold font-mono">{totales.en_poder}</span>
          <span className="text-xs text-muted">piezas en poder</span>
        </div>
        <div className="mt-1 text-xs text-muted">
          vs. <span className="font-mono font-medium">{totales.en_local}</span> en el local
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-xs font-medium text-muted uppercase tracking-wider">
          Total adeudado al local
        </div>
        <div className="mt-2 text-2xl font-bold font-mono text-danger">
          $ {Number(totales.adeudado_total).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
        </div>
        <div className="mt-1 text-xs text-muted">saldo pendiente de cobro</div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-xs font-medium text-muted uppercase tracking-wider">
          Liquidaciones pendientes
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-bold font-mono">
            $ {Number(totales.liquidaciones_pendientes_monto).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </span>
        </div>
        <div className="mt-1 text-xs text-muted">
          <span className="font-mono font-medium">{totales.liquidaciones_pendientes_cant}</span> liquidaciones por cobrar
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-xs font-medium text-muted uppercase tracking-wider">
          Declaraciones pendientes
        </div>
        <div className="mt-2 text-2xl font-bold font-mono">0</div>
        <div className="mt-1 text-xs text-muted">disponible en Slice 9b</div>
      </div>
    </div>
  )
}
