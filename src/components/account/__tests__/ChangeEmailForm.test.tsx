// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ChangeEmailForm from '../ChangeEmailForm'
import { ApiError } from '../../../api/errors'

/**
 * Both mailboxes are proved, in order. The step that must never be skippable is
 * the first: without proof of the current address, a stolen session could move
 * the account somewhere its holder cannot reach.
 */

const { challengeMock, requestMock, changeMock } = vi.hoisted(() => ({
  challengeMock: vi.fn(),
  requestMock: vi.fn(),
  changeMock: vi.fn(),
}))

vi.mock('../../../api/auth', () => ({
  requestEmailChallenge: challengeMock,
  requestEmailChange: requestMock,
  changeEmail: changeMock,
}))

beforeEach(() => {
  challengeMock.mockReset()
  requestMock.mockReset()
  changeMock.mockReset()
})

afterEach(() => {
  cleanup()
})

function renderForm() {
  const onChanged = vi.fn()
  render(<ChangeEmailForm currentEmail="asha@example.com" onChanged={onChanged} />)
  return { onChanged }
}

async function reachCurrentStep() {
  challengeMock.mockResolvedValue(undefined)
  const handles = renderForm()
  fireEvent.click(screen.getByRole('button', { name: /^change email$/i }))
  await screen.findByLabelText('CODE FROM CURRENT ADDRESS')
  return handles
}

async function reachNewStep() {
  const handles = await reachCurrentStep()
  requestMock.mockResolvedValue(undefined)
  fireEvent.change(screen.getByLabelText(/new email/i), { target: { value: 'new@example.com' } })
  fireEvent.change(screen.getByLabelText('CODE FROM CURRENT ADDRESS'), {
    target: { value: '111111' },
  })
  fireEvent.click(screen.getByRole('button', { name: /^continue$/i }))
  await screen.findByLabelText('CODE FROM NEW ADDRESS')
  return handles
}

describe('ChangeEmailForm', () => {
  it('starts by proving the current address', async () => {
    await reachCurrentStep()

    expect(challengeMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status').textContent).toMatch(/asha@example\.com/)
  })

  it('spends the current-address code to reach the new one', async () => {
    await reachNewStep()

    expect(requestMock).toHaveBeenCalledWith({ newEmail: 'new@example.com', otp: '111111' })
  })

  it('will not continue without both the address and a full code', async () => {
    await reachCurrentStep()

    fireEvent.change(screen.getByLabelText(/new email/i), { target: { value: 'new@example.com' } })
    fireEvent.change(screen.getByLabelText('CODE FROM CURRENT ADDRESS'), { target: { value: '11' } })

    expect(screen.getByRole('button', { name: /^continue$/i }).hasAttribute('disabled')).toBe(true)
    expect(requestMock).not.toHaveBeenCalled()
  })

  it('completes with the code sent to the new address', async () => {
    const { onChanged } = await reachNewStep()
    changeMock.mockResolvedValue(undefined)

    fireEvent.change(screen.getByLabelText('CODE FROM NEW ADDRESS'), { target: { value: '222222' } })
    fireEvent.click(screen.getByRole('button', { name: /^change email$/i }))

    await waitFor(() =>
      expect(changeMock).toHaveBeenCalledWith({ newEmail: 'new@example.com', otp: '222222' }),
    )
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
  })

  it('reports a rejected code and clears it', async () => {
    await reachCurrentStep()
    requestMock.mockRejectedValue(
      new ApiError({ message: 'Invalid OTP', status: 400, code: 'INVALID_OTP' }),
    )

    fireEvent.change(screen.getByLabelText(/new email/i), { target: { value: 'new@example.com' } })
    fireEvent.change(screen.getByLabelText('CODE FROM CURRENT ADDRESS'), {
      target: { value: '000000' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }))

    await screen.findByRole('alert')
    expect(screen.getByRole('alert').textContent).toMatch(/not right|expired/i)
    expect((screen.getByLabelText('CODE FROM CURRENT ADDRESS') as HTMLInputElement).value).toBe('')
  })

  it('never reaches the new address without the first code', async () => {
    await reachCurrentStep()

    // The only route to the second step runs through requestEmailChange.
    expect(screen.queryByLabelText('CODE FROM NEW ADDRESS')).toBeNull()
    expect(changeMock).not.toHaveBeenCalled()
  })

  it('abandons cleanly, leaving the address unchanged', async () => {
    await reachNewStep()

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))

    expect(screen.getByRole('button', { name: /^change email$/i })).toBeTruthy()
    expect(changeMock).not.toHaveBeenCalled()
  })
})
