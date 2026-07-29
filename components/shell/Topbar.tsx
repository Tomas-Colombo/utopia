import type { Session } from '@/lib/dal/session'

/**
 * Sticky topbar for the (app) group. Semi-transparent background per
 * design tokens (`--topbar`). Left slot = page title (passed in as
 * `title`), right slot = user chip / actions (theme toggle lives in
 * root layout — REQ-DS-06 says it must be reachable from every route).
 */

interface TopbarProps {
  title: string
  session: Session
  actions?: React.ReactNode
}

export function Topbar({ title, session, actions }: TopbarProps) {
  return (
    <header
      className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-topbar px-6 py-3 backdrop-blur"
      aria-label="Barra superior"
    >
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-lg text-text">{title}</h1>
      </div>
      <div className="flex items-center gap-3">
        {actions}
        <span className="hidden text-xs text-muted md:inline">
          {session.user.email}
        </span>
      </div>
    </header>
  )
}
