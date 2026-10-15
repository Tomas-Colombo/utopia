import type { Session } from '@/lib/dal/session'
import { PageBand, type BandKpi } from './PageBand'

/**
 * Page header for the (app) group. Thin adapter over `PageBand` (tema Grafito
 * + Lino) so every page that still calls `Topbar` gets the same dark strip as
 * Ventas without touching its call site.
 *
 * `session` stays on the props so call sites don't churn. `backHref` renders
 * an explicit "volver" link (not `router.back()`) so it always lands on the
 * parent section regardless of how the user arrived.
 */
interface TopbarProps {
  title: string
  session: Session
  actions?: React.ReactNode
  backHref?: string
  backLabel?: string
  /** Metrics shown in the band, same contract as `PageBand`. */
  kpis?: BandKpi[]
  /** Period / search filters rendered next to the title. */
  filters?: React.ReactNode
}

export function Topbar({ title, actions, backHref, backLabel, kpis, filters }: TopbarProps) {
  return (
    <PageBand
      breadcrumb={[title]}
      title={title}
      actions={actions}
      kpis={kpis}
      filters={filters}
      backHref={backHref}
      backLabel={backLabel}
    />
  )
}
