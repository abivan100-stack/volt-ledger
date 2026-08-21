import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { AuthService } from './auth/auth.js'
import { buildApp } from './app.js'

const apps: FastifyInstance[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

describe('Volt API', () => {
  it('reports a healthy API and database', async () => {
    const app = await buildApp({ logger: false, databasePing: async () => undefined })
    apps.push(app)

    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      status: 'ok',
      service: 'volt-api',
      database: 'ok',
    })
  })

  it('returns a dependency failure without exposing database details', async () => {
    const app = await buildApp({
      logger: false,
      databasePing: async () => {
        throw new Error('simulated database failure')
      },
    })
    apps.push(app)

    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual({
      status: 'degraded',
      service: 'volt-api',
      database: 'unavailable',
    })
    expect(response.body).not.toContain('simulated database failure')
  })

  it('rejects unauthenticated API requests', async () => {
    const auth: AuthService = {
      handle: async () => new Response(null, { status: 204 }),
      createVerificationCode: async () => '123456',
      getSession: async () => null,
    }
    const app = await buildApp({ logger: false, auth })
    apps.push(app)

    const response = await app.inject({ method: 'GET', url: '/api/v1/me' })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({
      error: 'Authentication required',
      code: 'UNAUTHENTICATED',
    })
  })

  it('forwards Better Auth requests and response headers', async () => {
    let receivedUrl = ''
    let receivedMethod = ''
    let receivedBody = ''
    const auth: AuthService = {
      createVerificationCode: async () => '123456',
      handle: async (request) => {
        receivedUrl = request.url
        receivedMethod = request.method
        receivedBody = await request.text()
        return new Response(JSON.stringify({ accepted: true }), {
          status: 201,
          headers: {
            'content-type': 'application/json',
            'set-cookie': 'session=test-session; HttpOnly; SameSite=Lax',
          },
        })
      },
      getSession: async () => null,
    }
    const app = await buildApp({ logger: false, auth })
    apps.push(app)

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: 'asha@example.com', password: 'correct-horse-battery-staple' },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toEqual({ accepted: true })
    expect(response.headers['set-cookie']).toContain('session=test-session')
    expect(receivedUrl).toBe('http://localhost:4000/api/auth/sign-up/email')
    expect(receivedMethod).toBe('POST')
    expect(JSON.parse(receivedBody)).toEqual({
      email: 'asha@example.com',
      password: 'correct-horse-battery-staple',
    })
  })

  it('returns the authenticated user without exposing a session token', async () => {
    const auth: AuthService = {
      handle: async () => new Response(null, { status: 204 }),
      createVerificationCode: async () => '123456',
      getSession: async () => ({
        user: {
          id: 'user_123',
          name: 'Asha Raman',
          email: 'asha@example.com',
          emailVerified: true,
        },
        session: {
          id: 'session_123',
          expiresAt: new Date('2030-01-01T00:00:00.000Z'),
        },
      }),
    }
    const app = await buildApp({ logger: false, auth })
    apps.push(app)

    const response = await app.inject({ method: 'GET', url: '/api/v1/me' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      user: {
        id: 'user_123',
        name: 'Asha Raman',
        email: 'asha@example.com',
        emailVerified: true,
      },
      session: {
        id: 'session_123',
        expiresAt: '2030-01-01T00:00:00.000Z',
      },
    })
    expect(response.body).not.toContain('token')
  })
})
