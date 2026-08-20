// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import SignInForm from '../SignInForm'
import { useSessionStore } from '../../../store/useSessionStore'
import { ApiError } from '../../../api/errors'

const { signInMock, fetchSessionMock, signOutMock } = vi.hoisted(() => ({
  signInMock: vi.fn(),
  fetchSessionMock: vi.fn(),
  signOutMock: vi.fn(),
}))

vi.mock('../../../api/auth', () => ({
  signInWithEmail: signInMock,
  signUpWithEmail: vi.fn(),
}))

vi.mock('../../../api/session', () => ({
  fetchSession: fetchSessionMock,
  signOut: signOutMock,
}))

const pristine = useSessionStore.getState()

beforeEach(() => {
  useSessionStore.setState(pristine, true)
  signInMock.mockReset()
  fetchSessionMock.mockReset()
  fetchSessionMock.mockResolvedValue({
    user: { id: 'user-1', name: 'Asha', email: 'asha@example.com', emailVerified: true },
    session: { id: 'session-1', expiresAt: '2026-09-01T00:00:00.000Z' },
  })
})

afterEach(() => {
  cleanup()
})

function emailField(): HTMLInputElement {
  return screen.getByLabelText(/email/i) as HTMLInputElement
}

function submitButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: /sign in/i }) as HTMLButtonElement
}

function fillCredentials(email = 'asha@example.com', password = 'a-long-password'): void {
  fireEvent.change(emailField(), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('PASSWORD'), { target: { value: password } })
}

describe('SignInForm', () => {
  it('submits the entered credentials', async () => {
    signInMock.mockResolvedValue(undefined)
    render(<SignInForm />)

    fillCredentials()
    fireEvent.click(submitButton())

    await waitFor(() => expect(signInMock).toHaveBeenCalledTimes(1))
    expect(signInMock).toHaveBeenCalledWith({
      email: 'asha@example.com',
      password: 'a-long-password',
    })
  })

  it('signs the visitor in', async () => {
    signInMock.mockResolvedValue(undefined)
    render(<SignInForm />)

    fillCredentials()
    fireEvent.click(submitButton())

    await waitFor(() => expect(useSessionStore.getState().status).toBe('authenticated'))
  })

  it('disables the submit control while the request is in flight', async () => {
    let release: () => void = () => {}
    signInMock.mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve
      }),
    )
    render(<SignInForm />)

    fillCredentials()
    fireEvent.click(submitButton())

    await waitFor(() => expect(submitButton().disabled).toBe(true))
    release()
    await waitFor(() => expect(submitButton().disabled).toBe(false))
  })

  it('reports a rejected credential without clearing the email', async () => {
    signInMock.mockRejectedValue(
      new ApiError({ message: 'Invalid email or password', status: 401, code: 'INVALID_EMAIL_OR_PASSWORD' }),
    )
    render(<SignInForm />)

    fillCredentials()
    fireEvent.click(submitButton())

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/Invalid email or password/i)
    expect(emailField().value).toBe('asha@example.com')
  })

  it('explains that the address still needs verifying on a 403', async () => {
    signInMock.mockRejectedValue(
      new ApiError({ message: 'Email not verified', status: 403, code: 'EMAIL_NOT_VERIFIED' }),
    )
    render(<SignInForm />)

    fillCredentials()
    fireEvent.click(submitButton())

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/verif/i)
  })

  it('surfaces an unreachable API as a retryable message', async () => {
    signInMock.mockRejectedValue(
      new ApiError({ message: 'Could not reach the Volt API', status: 0, code: 'NETWORK_ERROR' }),
    )
    render(<SignInForm />)

    fillCredentials()
    fireEvent.click(submitButton())

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/Could not reach the Volt API/i)
  })

  it('clears a previous error when the visitor submits again', async () => {
    signInMock.mockRejectedValueOnce(
      new ApiError({ message: 'Invalid email or password', status: 401, code: 'INVALID_EMAIL_OR_PASSWORD' }),
    )
    render(<SignInForm />)

    fillCredentials()
    fireEvent.click(submitButton())
    await screen.findByRole('alert')

    signInMock.mockResolvedValueOnce(undefined)
    fireEvent.click(submitButton())

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('does not submit without an email and password', () => {
    render(<SignInForm />)
    fireEvent.click(submitButton())
    expect(signInMock).not.toHaveBeenCalled()
  })
})
