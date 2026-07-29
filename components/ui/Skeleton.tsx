'use client'

import { useEffect, useState } from 'react'

export interface SkeletonProps {
  width?: string | number
  height?: string | number
  className?: string
  /** default: theme radius (rounded-md) */
  borderRadius?: string
  'data-testid'?: string
}

function toDimension(value: string | number | undefined): string | undefined {
  if (value === undefined) return undefined
  return typeof value === 'number' ? `${value}px` : value
}

/**
 * Loading placeholder used everywhere a component would otherwise render
 * empty content while data is in flight (REQ-DS-13). `aria-busy`/`aria-hidden`
 * make the loading state explicit to assistive tech; the shimmer animation
 * is skipped when the user prefers reduced motion.
 */
export function Skeleton({
  width,
  height,
  className = '',
  borderRadius,
  'data-testid': testId,
}: SkeletonProps) {
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external-store sync on mount
    setReducedMotion(query.matches)
  }, [])

  return (
    <div
      data-testid={testId}
      role="status"
      aria-busy="true"
      aria-hidden="false"
      style={{
        width: toDimension(width),
        height: toDimension(height),
        borderRadius,
      }}
      className={`bg-card-3 ${reducedMotion ? '' : 'animate-pulse'} ${className}`.trim()}
    />
  )
}
