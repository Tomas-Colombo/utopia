import type { ReactNode } from 'react'
import Link from 'next/link'

interface BandActionProps {
  href: string
  title: string
  description?: ReactNode
  /** `primary` is the lino card (one per page); `secondary` is the outlined row. */
  tone?: 'primary' | 'secondary'
  /** Small pill on the right of a secondary action (e.g. "2 vencen"). */
  badge?: ReactNode
}

/**
 * Action card for the right-hand column of `PageBand`. Only layout and skin:
 * it is a plain link, so the destination and permissions are the caller's.
 */
export function BandAction({ href, title, description, tone = 'secondary', badge }: BandActionProps) {
  if (tone === 'primary') {
    return (
      <Link
        href={href}
        className="flex min-h-[84px] flex-1 flex-col justify-between gap-2 rounded-[5px] bg-accent px-4 py-3 text-accent-ink transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-band-ink"
      >
        <span className="text-lg font-bold leading-none tracking-[-0.02em] [font-stretch:120%]">{title}</span>
        <span className="flex items-end justify-between gap-3">
          {description && <span className="text-xs leading-snug text-accent-ink/80">{description}</span>}
          <span aria-hidden className="text-xl leading-none">→</span>
        </span>
      </Link>
    )
  }
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-[5px] border border-band-line px-4 py-2.5 transition-colors hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-band-ink"
    >
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold">{title}</span>
        {description && <span className="text-xs text-band-muted">{description}</span>}
      </span>
      {badge && (
        <span className="rounded-[3px] bg-warn-on-dark px-2 py-[3px] font-mono text-xs font-medium text-band">
          {badge}
        </span>
      )}
    </Link>
  )
}
