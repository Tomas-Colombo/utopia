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
      className="flex items-center gap-2 rounded-md border border-control-line bg-control px-3 py-2 transition-colors hover:border-muted-2 focus-within:border-ink focus-within:ring-1 focus-within:ring-ink"
    >
      <input
        ref={inputRef}
        type="text"
        role="searchbox"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleInputKeyDown}
        className="flex-1 bg-transparent text-[13.5px] text-text outline-none placeholder:text-muted"
      />
      {value !== '' && (
        <button
          type="button"
          aria-label="Clear filter"
          onClick={handleClear}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted transition-colors hover:bg-hover hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-ink"
        >
          ×
        </button>
      )}
    </div>
  )
}
