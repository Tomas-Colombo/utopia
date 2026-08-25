import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SettingsView } from './SettingsView'

describe('SettingsView (smoke)', () => {
  it('renders profile info and the password change form', () => {
    render(<SettingsView email="user@example.com" roleName="Owner" />)

    expect(screen.getByText('user@example.com')).toBeInTheDocument()
    expect(screen.getByText('Owner')).toBeInTheDocument()
    expect(screen.getByLabelText('Current password')).toBeInTheDocument()
    expect(screen.getByLabelText('New password')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirm new password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /update password/i })).toBeInTheDocument()
  })
})
