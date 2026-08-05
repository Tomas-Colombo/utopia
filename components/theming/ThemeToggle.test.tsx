import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from './ThemeProvider'
import { ThemeToggle } from './ThemeToggle'

// The toggle also mirrors the choice to the `configuracion` table through a
// Server Action. That round trip is covered by persistThemePreference.test.ts;
// here it only needs to not reach the network.
vi.mock('./persistThemePreference', () => ({
  persistThemePreference: vi.fn().mockResolvedValue(undefined),
}))

describe('ThemeToggle', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  it('toggles the theme, updates the DOM attribute and localStorage without reloading', async () => {
    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    )

    // First visit opens dark, so the switch offers the way out: light mode.
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('dark'))

    const button = screen.getByRole('button', { name: 'Modo claro' })
    await user.click(button)

    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('light'))
    expect(window.localStorage.getItem('utopia-theme')).toBe('light')
    // A full page reload would tear down and recreate the DOM (and reset
    // localStorage in a real browser); the SAME button node surviving the
    // click, still reflecting the new state, proves this was an in-place
    // client-side re-render, not a navigation.
    expect(document.body.contains(button)).toBe(true)
    expect(button).toHaveTextContent('Modo oscuro')
  })

  it('toggles back to dark on a second click', async () => {
    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    )

    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('dark'))

    const button = screen.getByRole('button', { name: 'Modo claro' })
    await user.click(button)
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('light'))

    await user.click(button)
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('dark'))
    expect(window.localStorage.getItem('utopia-theme')).toBe('dark')
  })
})
