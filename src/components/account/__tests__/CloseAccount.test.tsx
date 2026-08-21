// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import CloseAccount from '../CloseAccount'
import { ApiError } from '../../../api/errors'

/**
 * Closing cannot be undone and nobody can undo it for anyone else, so the one
 * behaviour that matters is that a single stray click never does it.
 */

const { closeMock } = vi.hoisted(() => ({ closeMock: vi.fn() }))

vi.mock('../../../api/session', () => ({
  closeAccount: closeMock,
  fetchSession: vi.fn(),
  signOut: vi.fn(),
}))

beforeEach(() => {
  closeMock.mockReset()
})

afterEach(() => {
  cleanup()
})

function openConfirmation(): void {
  fireEvent.click(screen.getByRole('button', { name: /^close account$/i }))
}

describe('CloseAccount', () => {
  it('does not close on the first click', () => {
    render(<CloseAccount />)

    openConfirmation()

    expect(closeMock).not.toHaveBeenCalled()
  })

  it('says what survives before asking again', () => {
    render(<CloseAccount />)

    openConfirmation()

    // "Delete my account" and what actually happens are not the same thing.
    const warning = screen.getByText(/cannot be undone/i)
    expect(warning.textContent).toMatch(/settlement records/i)
  })

  it('closes once confirmed', async () => {
    closeMock.mockResolvedValue(undefined)
    const onClosed = vi.fn()
    render(<CloseAccount onClosed={onClosed} />)

    openConfirmation()
    fireEvent.click(screen.getByRole('button', { name: /yes, close my account/i }))

    await waitFor(() => expect(closeMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(onClosed).toHaveBeenCalledTimes(1))
  })

  it('lets the visitor back out', () => {
    render(<CloseAccount />)

    openConfirmation()
    fireEvent.click(screen.getByRole('button', { name: /keep my account/i }))

    expect(screen.getByRole('button', { name: /^close account$/i })).toBeTruthy()
    expect(closeMock).not.toHaveBeenCalled()
  })

  it('explains a refusal and returns to the starting state', async () => {
    closeMock.mockRejectedValue(
      new ApiError({
        message: 'Transfer ownership or archive the organisations you own before closing your account.',
        status: 409,
        code: 'ACCOUNT_OWNS_ORGANISATIONS',
      }),
    )
    render(<CloseAccount />)

    openConfirmation()
    fireEvent.click(screen.getByRole('button', { name: /yes, close my account/i }))

    await screen.findByRole('alert')
    expect(screen.getByRole('alert').textContent).toMatch(/transfer ownership|archive/i)
    // Not left mid-confirmation, since the reason needs acting on elsewhere.
    expect(screen.getByRole('button', { name: /^close account$/i })).toBeTruthy()
  })

  it('does not report a closure that failed', async () => {
    closeMock.mockRejectedValue(
      new ApiError({ message: 'Could not reach the Volt API', status: 0, code: 'NETWORK_ERROR' }),
    )
    const onClosed = vi.fn()
    render(<CloseAccount onClosed={onClosed} />)

    openConfirmation()
    fireEvent.click(screen.getByRole('button', { name: /yes, close my account/i }))

    await screen.findByRole('alert')
    expect(onClosed).not.toHaveBeenCalled()
  })
})
