'use client'

import type { ReactNode } from 'react'

export interface EmptyStateCta {
  label: string
  onClick: () => void
}

export interface EmptyStateProps {
  title: string
  description?: string
  /** Required — an empty state MUST always offer a next action (REQ-DS-12). */
  cta: EmptyStateCta
  icon?: ReactNode
}

/**
 * Renders in place of an empty list/table (REQ-DS-12, spec §3.3). `cta` is
 * required at the type level; the runtime check below only guards against
 * plain-JS callers that bypass TypeScript.
 */
export function EmptyState({ title, description, cta, icon }: EmptyStateProps) {
  if (!cta || typeof cta.onClick !== 'function' || !cta.label) {
    console.warn('EmptyState requires a cta prop — see REQ-DS-12')
    return null
  }

  return (
    <div role="status" className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      {icon && <div aria-hidden="true" className="mb-1 text-muted-2">{icon}</div>}
      <p className="font-display text-lg text-text">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {/* bg-block / text-block-ink invert together between themes, so the pair
          keeps its contrast in both (the accent is reserved for the main action). */}
      <button
        type="button"
        onClick={cta.onClick}
        className="mt-2 rounded-md bg-block px-4 py-2 font-body text-[13px] font-semibold text-block-ink transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink active:translate-y-px"
      >
        {cta.label}
      </button>
    </div>
  )
}
