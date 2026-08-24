// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import SignUpForm from '../SignUpForm'
import { ApiError } from '../../../api/errors'

const { resendMock, signUpMock, verifyMock } = vi.hoisted(() => ({
  resendMock: vi.fn(),
  signUpMock: vi.fn(),
  verifyMock: vi.fn(),
}))

vi.mock('../../../api/auth', () => ({
  signUpWithEmail: signUpMock,
  resendVerificationEmail: resendMock,
  verifyEmailOtp: verifyMock,
  signInWithEmail: vi.fn(),
}))

beforeEach(() => {
  signUpMock.mockReset()
  resendMock.mockReset()
  verifyMock.mockReset()
})

afterEach(() => {
  cleanup()
})

function submitButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: /create account/i }) as HTMLButtonElement
}

function codeField(): HTMLInputElement {
  return screen.getByLabelText('VERIFICATION CODE') as HTMLInputElement
}

function verifyButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: /^verify/i }) as HTMLButtonElement
}

/** Signs up and lands on the code step. */
async function reachCodeStep(): Promise<void> {
  signUpMock.mockResolvedValue(undefined)
  render(<SignUpForm />)
  fillForm()
  fireEvent.click(submitButton())
  await screen.findByRole('status')
}

function fillForm(password = 'a-sufficiently-long-password'): void {
  fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Asha' } })
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'asha@example.com' } })
  fireEvent.change(screen.getByLabelText('PASSWORD'), { target: { value: password } })
}

describe('SignUpForm', () => {
  it('submits the name, email and password', async () => {
    signUpMock.mockResolvedValue(undefined)
    render(<SignUpForm />)

    fillForm()
    fireEvent.click(submitButton())

    await waitFor(() => expect(signUpMock).toHaveBeenCalledTimes(1))
    expect(signUpMock).toHaveBeenCalledWith({
      name: 'Asha',
      email: 'asha@example.com',
      password: 'a-sufficiently-long-password',
    })
  })

  it('tells the visitor to verify their address instead of claiming they are signed in', async () => {
    signUpMock.mockResolvedValue(undefined)
    render(<SignUpForm />)

    fillForm()
    fireEvent.click(submitButton())

    const confirmation = await screen.findByRole('status')
    // A code was sent, not a session created; the copy has to say which.
    expect(confirmation.textContent).toMatch(/code/i)
    expect(confirmation.textContent).toMatch(/asha@example\.com/)
  })

  it('replaces the form with the confirmation once submitted', async () => {
    signUpMock.mockResolvedValue(undefined)
    render(<SignUpForm />)

    fillForm()
    fireEvent.click(submitButton())

    await screen.findByRole('status')
    expect(screen.queryByLabelText('PASSWORD')).toBeNull()
  })

  it('lets the visitor return to the form after delivery confirmation', async () => {
    signUpMock.mockResolvedValue(undefined)
    render(<SignUpForm />)

    fillForm()
    fireEvent.click(submitButton())
    await screen.findByRole('status')

    fireEvent.click(screen.getByRole('button', { name: /different address/i }))

    expect(screen.getByLabelText('PASSWORD')).toBeTruthy()
  })

  it('can request a fresh verification email', async () => {
    signUpMock.mockResolvedValue(undefined)
    resendMock.mockResolvedValue(undefined)
    render(<SignUpForm />)

    fillForm()
    fireEvent.click(submitButton())
    await screen.findByRole('status')
    fireEvent.click(screen.getByRole('button', { name: /send a new code/i }))

    await waitFor(() => expect(resendMock).toHaveBeenCalledWith({ email: 'asha@example.com' }))
    expect(screen.getByText(/new code was requested\. if it does not arrive shortly, try again\./i)).toBeTruthy()
  })

  it('marks account fields as required for browser and assistive technology', () => {
    render(<SignUpForm />)

    expect(screen.getByLabelText(/name/i).getAttribute('required')).not.toBeNull()
    expect(screen.getByLabelText(/email/i).getAttribute('required')).not.toBeNull()
    expect(screen.getByLabelText('PASSWORD').getAttribute('required')).not.toBeNull()
  })

  it('rejects a password the server would refuse before sending it', () => {
    render(<SignUpForm />)

    fillForm('short')
    fireEvent.click(submitButton())

    expect(signUpMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/12/)
  })

  it('reports a server-side failure', async () => {
    signUpMock.mockRejectedValue(
      new ApiError({ message: 'Sign up is disabled', status: 400, code: 'SIGNUP_DISABLED' }),
    )
    render(<SignUpForm />)

    fillForm()
    fireEvent.click(submitButton())

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/Sign up is disabled/i)
  })

  it('keeps the form available after a failure so the visitor can retry', async () => {
    signUpMock.mockRejectedValue(
      new ApiError({ message: 'Could not reach the Volt API', status: 0, code: 'NETWORK_ERROR' }),
    )
    render(<SignUpForm />)

    fillForm()
    fireEvent.click(submitButton())

    await screen.findByRole('alert')
    expect(screen.queryByLabelText('PASSWORD')).not.toBeNull()
    expect(submitButton().disabled).toBe(false)
  })

  it('does not submit an empty form', () => {
    render(<SignUpForm />)
    fireEvent.click(submitButton())
    expect(signUpMock).not.toHaveBeenCalled()
  })

  it('redeems the code the visitor typed', async () => {
    await reachCodeStep()
    verifyMock.mockResolvedValue(undefined)

    fireEvent.change(codeField(), { target: { value: '123456' } })
    fireEvent.click(verifyButton())

    await waitFor(() =>
      expect(verifyMock).toHaveBeenCalledWith({ email: 'asha@example.com', otp: '123456' }),
    )
  })

  it('will not submit a half-typed code', async () => {
    await reachCodeStep()

    fireEvent.change(codeField(), { target: { value: '123' } })

    // Each submission spends one of a small number of allowed attempts, so a
    // code that cannot possibly be right must not cost one.
    expect(verifyButton().hasAttribute('disabled')).toBe(true)
    fireEvent.click(verifyButton())
    expect(verifyMock).not.toHaveBeenCalled()
  })

  it('reports a rejected code and clears the field for another try', async () => {
    await reachCodeStep()
    verifyMock.mockRejectedValue(
      new ApiError({ message: 'Invalid OTP', status: 400, code: 'INVALID_OTP' }),
    )

    fireEvent.change(codeField(), { target: { value: '000000' } })
    fireEvent.click(verifyButton())

    await screen.findByRole('alert')
    expect(screen.getByRole('alert').textContent).toMatch(/not right|expired/i)
    expect(codeField().value).toBe('')
  })

  it('confirms the address once the code is accepted', async () => {
    await reachCodeStep()
    verifyMock.mockResolvedValue(undefined)

    fireEvent.change(codeField(), { target: { value: '123456' } })
    fireEvent.click(verifyButton())

    await waitFor(() => expect(screen.queryByLabelText('VERIFICATION CODE')).toBeNull())
    expect(screen.getByRole('status').textContent).toMatch(/verified/i)
  })
})
