type KpiVariant = 'default' | 'alert' | 'highlight' | 'nested'
type KpiTone = 'default' | 'muted'

const BOX: Record<KpiVariant, string> = {
  default: 'border-border bg-card',
  alert: 'border-pink-strong bg-pink-bg',
  highlight: 'border-accent-pink bg-card',
  nested: 'border-border bg-card-2',
}

export interface KpiProps {
  label: string
  value: string
  sub?: string
  variant?: KpiVariant
  tone?: KpiTone
}

/**
 * Tarjeta de KPI estandarizada para las home-pages de módulos.
 *
 * El tamaño del valor baja a `text-xl` en el rango tablet (md) — donde el
 * grid pasa de 2 a 4 columnas y las cajas quedan angostas — y vuelve a
 * `text-2xl` en desktop. `[overflow-wrap:anywhere]` es la red de seguridad
 * para montos muy largos ("$ 1.234.567,89") que igual sobrarían: quiebran
 * dentro de la caja en vez de rebalsarla. `tabular-nums` mantiene los
 * dígitos alineados entre tarjetas.
 */
export function Kpi({ label, value, sub, variant = 'default', tone = 'default' }: KpiProps) {
  return (
    <div className={`min-w-0 rounded-lg border p-4 ${BOX[variant]}`}>
      <div className="font-mono text-xs uppercase text-muted [overflow-wrap:anywhere]">
        {label}
      </div>
      <div
        className={`mt-1 font-display text-2xl leading-tight tabular-nums md:text-xl lg:text-2xl [overflow-wrap:anywhere] ${
          tone === 'muted' ? 'text-muted' : 'text-text'
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  )
}
