import Link from 'next/link'
import type { Session } from '@/lib/dal/session'
import { FechaChip } from './FechaChip'

/**
 * Sticky topbar for the (app) group. Semi-transparent background per
 * design tokens (`--topbar`). Left slot = optional back link + page title
 * (passed in as `title`), right slot = actions + the current date (theme
 * toggle lives in root layout — REQ-DS-06 says it must be reachable from
 * every route).
 *
 * The user identity chip is NOT here: design system v2 moves it to the
 * bottom-left of the navigation rail (`SidebarClient`). `session` stays on
 * the props so call sites don't churn and the slot can be used again later.
 *
 * `backHref` renders a "volver" link to the parent section. It uses an
 * explicit href (not `router.back()`) so it always lands on the parent
 * category regardless of how the user arrived.
 */

interface TopbarProps {
  title: string
  session: Session
  actions?: React.ReactNode
  backHref?: string
  backLabel?: string
}

export function Topbar({ title, actions, backHref, backLabel }: TopbarProps) {
  return (
    <header
      className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-line bg-topbar px-6 py-3 pl-16 pr-24 backdrop-blur md:pl-6"
      aria-label="Barra superior"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {backHref && (
          <Link
            href={backHref}
            aria-label={backLabel ?? 'Volver'}
            title={backLabel ?? 'Volver'}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-panel-2 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-rosa"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
          </Link>
        )}
        <h1 className="truncate font-display text-lg uppercase tracking-[-0.01em] text-ink">
          {title}
        </h1>
      </div>
      <div className="flex items-center gap-3.5">
        {actions}
        <FechaChip />
      </div>
    </header>
  )
}
