import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LoginForm } from './LoginForm'

describe('LoginForm (smoke — Slice 7 agility mode)', () => {
  it('renders email, password inputs and a submit button', () => {
    render(<LoginForm />)

    expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument()
    const password = screen.getByLabelText('Contraseña')
    expect(password).toBeInTheDocument()
    expect(password).toHaveAttribute('type', 'password')
    expect(password).toHaveAttribute('autoComplete', 'current-password')
    expect(screen.getByRole('button', { name: 'Ingresar' })).toBeInTheDocument()
  })
})
