'use client'

import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'

export interface FilterBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Key that focuses the input from anywhere in the container. Set `false` to disable. */
  keyboardShortcut?: string | false
}

/**
 * Presentational live-filter input (REQ-DS-11). Debounce and URL-param
 * binding are the caller's responsibility for this slice — FilterBar only
 * reports every keystroke via `onChange`.
 */
export function FilterBar({
  value,
  onChange,
  placeholder = 'Filter...',
  keyboardShortcut = '/',
}: FilterBarProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!keyboardShortcut) return
    const container = containerRef.current
    if (!container) return

    function handleShortcut(event: globalThis.KeyboardEvent) {
      if (event.key === keyboardShortcut) {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }

    container.addEventListener('keydown', handleShortcut)
    return () => container.removeEventListener('keydown', handleShortcut)
  }, [keyboardShortcut])

  function handleInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onChange('')
    }
  }

  function handleClear() {
    onChange('')
    inputRef.current?.focus()
  }

  return (
    <div
      ref={containerRef}
      data-testid="filter-bar"
      className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
    >
      <input
        ref={inputRef}
        type="text"
        role="searchbox"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleInputKeyDown}
        className="flex-1 bg-transparent text-text outline-none"
      />
      {value !== '' && (
        <button
          type="button"
          aria-label="Clear filter"
          onClick={handleClear}
          className="text-muted hover:text-text"
        >
          ×
        </button>
      )}
    </div>
  )
}
