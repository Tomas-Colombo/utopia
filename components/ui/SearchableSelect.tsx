'use client'

import { useId, useRef, useState, type KeyboardEvent } from 'react'

export interface Option {
  value: string
  label: string
  disabled?: boolean
}

export interface SearchableSelectProps {
  options: Option[]
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  ariaLabel?: string
}

/**
 * Keyboard-first replacement for a native `<select>` (REQ-DS-09).
 * Uses the WAI-ARIA combobox pattern: the search input tracks the
 * highlighted candidate via `aria-activedescendant`, while `aria-selected`
 * on each option reflects the actually committed `value` prop.
 */
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  ariaLabel,
}: SearchableSelectProps) {
  const baseId = useId()
  const listboxId = `${baseId}-listbox`
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(search.toLowerCase()),
  )
  const selectedOption = options.find((option) => option.value === value)
  const highlightedOption = filteredOptions[highlightIndex]

  function firstEnabledIndex(list: Option[]): number {
    return list.findIndex((option) => !option.disabled)
  }

  function openListbox() {
    setSearch('')
    setHighlightIndex(Math.max(firstEnabledIndex(options), 0))
    setOpen(true)
  }

  function closeListbox() {
    setOpen(false)
    setSearch('')
  }

  function selectOption(option: Option | undefined) {
    if (!option || option.disabled) return
    onChange(option.value)
    closeListbox()
  }

  function moveHighlight(direction: 1 | -1) {
    if (filteredOptions.length === 0) return
    let next = highlightIndex
    for (let step = 0; step < filteredOptions.length; step++) {
      next += direction
      if (next < 0) next = filteredOptions.length - 1
      if (next > filteredOptions.length - 1) next = 0
      if (!filteredOptions[next]?.disabled) break
    }
    setHighlightIndex(next)
  }

  function handleSearchChange(nextSearch: string) {
    setSearch(nextSearch)
    setHighlightIndex(0)
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveHighlight(1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveHighlight(-1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      selectOption(highlightedOption)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      closeListbox()
    }
  }

  return (
    <div className="relative inline-block w-full">
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="w-full rounded-md border border-border bg-card px-3 py-2 text-left text-text"
        onClick={() => (open ? closeListbox() : openListbox())}
      >
        {selectedOption ? selectedOption.label : placeholder}
      </button>

      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-card-2 shadow">
          <input
            ref={searchInputRef}
            type="text"
            role="searchbox"
            aria-label="Search options"
            aria-controls={listboxId}
            aria-activedescendant={highlightedOption ? `${baseId}-option-${highlightIndex}` : undefined}
            value={search}
            onChange={(event) => handleSearchChange(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            autoFocus
            className="w-full border-b border-border bg-transparent px-3 py-2 text-text outline-none"
          />
          <ul id={listboxId} role="listbox" className="max-h-60 overflow-auto">
            {filteredOptions.length === 0 ? (
              <li className="px-3 py-2 text-muted">No results</li>
            ) : (
              filteredOptions.map((option, index) => (
                <li
                  key={option.value}
                  id={`${baseId}-option-${index}`}
                  role="option"
                  aria-selected={option.value === value}
                  aria-disabled={option.disabled ? true : undefined}
                  onClick={() => selectOption(option)}
                  className={`cursor-pointer px-3 py-2 ${
                    option.disabled ? 'cursor-not-allowed text-muted-2' : 'text-text'
                  } ${index === highlightIndex ? 'bg-pink-bg' : ''}`}
                >
                  {option.label}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
