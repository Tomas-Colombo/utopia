import type { ReactNode } from 'react'
import Link from 'next/link'
import { FechaChip } from './FechaChip'

export interface BandKpi {
  label: string
  value: ReactNode
  /** `warn` recolors the value with the warn channel that is AA on the band. */
  tone?: 'default' | 'warn'
  /** Small caption under the value. */
  sub?: ReactNode
}

interface PageBandProps {
  /** Plain text trail, last item is the current page. Not links on purpose:
   *  a link named like a sidebar item would double the nav landmark. */
  breadcrumb: string[]
  title: string
  /** Period filter etc. Rendered inside the `band-scope`, so ordinary
   *  Input/Button/Field components re-theme themselves for the dark strip. */
  filters?: ReactNode
  kpis?: BandKpi[]
  /** Right-hand side of the KPI row (secondary action + main action). */
  actions?: ReactNode
  /** Explicit "volver" link to the parent section (detail / form pages). */
  backHref?: string
  backLabel?: string
}

/**
 * Dark strip on top of a page (tema Grafito + Lino): breadcrumb, title, period
 * filters, KPIs separated by `band-line`, and the page actions on the right.
 * The area below it is the light `bg`, with the table on `panel`.
 *
 * It replaces `Topbar` on the pages that adopt it, so it keeps the same
 * contract: ONE `<h1>` holding exactly the title (e2e asserts it), the
 * `Barra superior` landmark, the left gutter that leaves room for the mobile
 * hamburger, and the date chip.
 *
 * `band-scope` (globals.css) remaps --ink/--muted/--control/... inside the
 * strip, which is what lets the shared form components work on a dark surface
 * without per-call overrides.
 */
export function PageBand({ breadcrumb, title, filters, kpis, actions, backHref, backLabel }: PageBandProps) {
  return (
    <header aria-label="Barra superior" className="band-scope bg-band text-band-ink">
      <div className="flex flex-col gap-4 px-6 pl-16 pt-4 md:pl-6">
        <div className="flex items-center justify-between gap-4">
          <nav aria-label="Ubicación">
            <ol className="eyebrow flex items-center gap-2 text-band-muted">
              {breadcrumb.map((item, i) => {
                const last = i === breadcrumb.length - 1
                return (
                  <li key={`${item}-${i}`} className="flex items-center gap-2">
                    {i > 0 && <span aria-hidden>/</span>}
                    <span aria-current={last ? 'page' : undefined} className={last ? 'text-band-ink' : ''}>
                      {item}
                    </span>
                  </li>
                )
              })}
            </ol>
          </nav>
          <FechaChip onDark />
        </div>

        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <div className="flex min-w-0 items-center gap-3">
            {backHref && (
              <Link
                href={backHref}
                aria-label={backLabel ?? 'Volver'}
                title={backLabel ?? 'Volver'}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-band-muted transition-colors hover:text-band-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-band-ink"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M19 12H5" />
                  <path d="M12 19l-7-7 7-7" />
                </svg>
              </Link>
            )}
            <h1 className="font-display text-[32px] uppercase leading-[.9] text-band-ink">
              {title}
            </h1>
          </div>
          {filters}
        </div>

        {(kpis?.length || actions) && (
          <div className="flex flex-col gap-4 border-t border-band-line md:flex-row md:items-center md:justify-between">
            {kpis && kpis.length > 0 ? (
              <dl className="grid grid-cols-2 md:flex">
                {kpis.map((k) => (
                  <div
                    key={k.label}
                    className="min-w-0 py-4 pr-4 md:pr-8 md:[&:not(:first-child)]:border-l md:[&:not(:first-child)]:border-band-line md:[&:not(:first-child)]:pl-8"
                  >
                    <dt className="eyebrow text-band-muted">{k.label}</dt>
                    <dd
                      className={`font-figure mt-1 text-2xl leading-tight [overflow-wrap:anywhere] ${
                        k.tone === 'warn' ? 'text-warn-on-dark' : 'text-band-ink'
                      }`}
                    >
                      {k.value}
                    </dd>
                    {k.sub && <div className="mt-1 text-xs text-band-muted">{k.sub}</div>}
                  </div>
                ))}
              </dl>
            ) : (
              <span />
            )}
            {actions && (
              <div className={`flex flex-wrap items-center gap-2 ${kpis?.length ? 'pb-4 md:pb-0' : 'py-4'}`}>
                {actions}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
