'use client'

import { useEffect, useState } from 'react'

/**
 * Current date, mono/uppercase, pinned to the top-right of the topbar
 * (design system v2). Format: `MAR 08 · JUL 2026`.
 *
 * Client component on purpose: the server renders with ITS clock and timezone,
 * which can be a day off from the user's near midnight. The first client render
 * recomputes from the browser clock, and `suppressHydrationWarning` absorbs the
 * text difference instead of blanking the slot and shifting the layout.
 */
export function FechaChip() {
  const [label, setLabel] = useState(() => formatToday(new Date()))

  useEffect(() => {
    setLabel(formatToday(new Date()))
  }, [])

  return (
    <span
      suppressHydrationWarning
      className="hidden font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-2 sm:inline"
    >
      {label}
    </span>
  )
}

const WEEKDAY = new Intl.DateTimeFormat('es-AR', { weekday: 'short' })
const MONTH = new Intl.DateTimeFormat('es-AR', { month: 'short' })

/** `MAR 08 · JUL 2026` — trailing dots that some locales append are stripped. */
function formatToday(date: Date): string {
  const weekday = clean(WEEKDAY.format(date))
  const month = clean(MONTH.format(date))
  const day = String(date.getDate()).padStart(2, '0')
  return `${weekday} ${day} · ${month} ${date.getFullYear()}`
}

function clean(part: string): string {
  return part.replace(/\.$/, '').toUpperCase()
}
