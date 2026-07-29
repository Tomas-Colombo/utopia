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
    <div role="status" className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      {icon && <div aria-hidden="true">{icon}</div>}
      <p className="font-display text-lg text-text">{title}</p>
      {description && <p className="text-sm text-muted">{description}</p>}
      {/* text-sidebar (fixed near-black in both themes, REQ-DS-07) is used
          instead of text-text: text-text is LIGHT in dark mode and fails AA
          against the light accent-pink background there (verified 1.6:1). */}
      <button
        type="button"
        onClick={cta.onClick}
        className="rounded-md bg-accent-pink px-4 py-2 font-body text-sm font-semibold text-sidebar"
      >
        {cta.label}
      </button>
    </div>
  )
}
