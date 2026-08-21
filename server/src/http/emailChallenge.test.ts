import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { AuthService } from '../auth/auth.js'
import { buildApp } from '../app.js'

/**
 * Proving the current mailbox before an email change.
 *
 * The plugin ships its own sender, which takes any address from an
 * unauthenticated caller and would mail a registered stranger on request. This
 * route exists so the address is fixed by the session instead — it can only ever
 * send to the caller.
 */

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }))

vi.mock('../email/resend.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../email/resend.js')>()
  return { ...actual, sendVerificationCodeEmail: sendMock }
})

const apps: FastifyInstance[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
  sendMock.mockReset()
})

function authFor(email: string | null): AuthService {
  return {
    handle: async () => new Response(null, { status: 204 }),
    createVerificationCode: async () => '482913',
    getSession: async () =>
      email === null
        ? null
        : {
            user: { id: 'user_123', name: 'Asha', email, emailVerified: true },
            session: { id: 'session_123', expiresAt: new Date('2030-01-02T00:00:00.000Z') },
          },
  }
}

async function challenge(email: string | null = 'asha@example.com') {
  const app = await buildApp({ logger: false, auth: authFor(email), repositories: {} as never })
  apps.push(app)
  return app.inject({ method: 'POST', url: '/api/v1/me/email/challenge' })
}

describe('POST /api/v1/me/email/challenge', () => {
  it('sends a code and says so', async () => {
    sendMock.mockResolvedValue(undefined)

    const response = await challenge()

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ sent: true })
  })

  it('sends only to the address on the session', async () => {
    sendMock.mockResolvedValue(undefined)

    await challenge('asha@example.com')

    // No parameter can point this at anyone else.
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'asha@example.com', code: '482913' }),
    )
  })

  it('never echoes the code or the address it sent to', async () => {
    sendMock.mockResolvedValue(undefined)

    const response = await challenge()

    const body = JSON.stringify(response.json())
    expect(body).not.toContain('482913')
    expect(body).not.toContain('asha@example.com')
  })

  it('requires a session', async () => {
    const response = await challenge(null)

    expect(response.statusCode).toBe(401)
    expect(sendMock).not.toHaveBeenCalled()
  })
})
