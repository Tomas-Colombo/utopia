import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from './ThemeProvider'
import { ThemeToggle } from './ThemeToggle'

describe('ThemeToggle', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('toggles the theme, updates the DOM attribute and localStorage without reloading', async () => {
    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    )

    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('light'))

    const button = screen.getByRole('button', { name: 'Toggle theme' })
    await user.click(button)

    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('dark'))
    expect(window.localStorage.getItem('utopia-theme')).toBe('dark')
    // A full page reload would tear down and recreate the DOM (and reset
    // localStorage in a real browser); the SAME button node surviving the
    // click, still reflecting the new state, proves this was an in-place
    // client-side re-render, not a navigation.
    expect(document.body.contains(button)).toBe(true)
    expect(button).toHaveTextContent('Light mode')
  })

  it('toggles back to light on a second click', async () => {
    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    )

    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('light'))

    const button = screen.getByRole('button', { name: 'Toggle theme' })
    await user.click(button)
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('dark'))

    await user.click(button)
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('light'))
    expect(window.localStorage.getItem('utopia-theme')).toBe('light')
  })
})
