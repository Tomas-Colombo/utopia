import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from './ConfirmDialog'

function renderDialog(overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  const utils = render(
    <ConfirmDialog
      open
      title="Delete product"
      description="This cannot be undone."
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />,
  )
  return { onConfirm, onCancel, ...utils }
}

describe('ConfirmDialog', () => {
  it('does not render anything when open is false', () => {
    render(
      <ConfirmDialog
        open={false}
        title="Delete product"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders a dialog with aria-modal and aria-labelledby pointing at the title when open', () => {
    renderDialog()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    const labelledBy = dialog.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    const titleEl = document.getElementById(labelledBy!)
    expect(titleEl).toHaveTextContent('Delete product')
  })

  it('renders title, description, confirm button and cancel button', () => {
    renderDialog()
    expect(screen.getByText('Delete product')).toBeInTheDocument()
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('uses custom confirmLabel/cancelLabel when provided', () => {
    renderDialog({ confirmLabel: 'Delete', cancelLabel: 'Keep it' })
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep it' })).toBeInTheDocument()
  })

  it('moves initial focus to the confirm button when opened', () => {
    renderDialog()
    expect(screen.getByRole('button', { name: 'Confirm' })).toHaveFocus()
  })

  it('traps focus: Tab from the last focusable element wraps to the first', async () => {
    const user = userEvent.setup()
    renderDialog()
    const cancelButton = screen.getByRole('button', { name: 'Cancel' })
    const confirmButton = screen.getByRole('button', { name: 'Confirm' })

    cancelButton.focus()
    expect(cancelButton).toHaveFocus()

    await user.tab()
    expect(confirmButton).toHaveFocus()
  })

  it('traps focus: Shift+Tab from the first focusable element wraps to the last', async () => {
    const user = userEvent.setup()
    renderDialog()
    const confirmButton = screen.getByRole('button', { name: 'Confirm' })
    const cancelButton = screen.getByRole('button', { name: 'Cancel' })

    confirmButton.focus()
    expect(confirmButton).toHaveFocus()

    await user.tab({ shift: true })
    expect(cancelButton).toHaveFocus()
  })

  it('calls onCancel when Escape is pressed', async () => {
    const user = userEvent.setup()
    const { onCancel } = renderDialog()

    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onConfirm when Enter is pressed on the confirm button', async () => {
    const user = userEvent.setup()
    const { onConfirm } = renderDialog()

    await user.keyboard('{Enter}')
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when the backdrop is clicked', async () => {
    const user = userEvent.setup()
    const { onCancel } = renderDialog()

    await user.click(screen.getByTestId('confirm-dialog-backdrop'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('does not call onCancel when clicking inside the dialog', async () => {
    const user = userEvent.setup()
    const { onCancel } = renderDialog()

    await user.click(screen.getByText('Delete product'))
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('applies a danger-emphasized confirm button when variant="danger"', () => {
    renderDialog({ variant: 'danger' })
    expect(screen.getByRole('button', { name: 'Confirm' })).toHaveAttribute(
      'data-variant',
      'danger',
    )
  })
})
