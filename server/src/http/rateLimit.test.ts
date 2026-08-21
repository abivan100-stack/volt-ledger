import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { AuthService } from '../auth/auth.js'
import { buildApp } from '../app.js'

const apps: FastifyInstance[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

const auth: AuthService = {
  handle: async () => new Response(null, { status: 204 }),
  createVerificationCode: async () => '123456',
  getSession: async () => null,
}

async function createApp(trustProxy: boolean): Promise<FastifyInstance> {
  const app = await buildApp({
    logger: false,
    auth,
    trustProxy,
    databasePing: async () => undefined,
  })
  apps.push(app)
  return app
}

describe('API rate limits', () => {
  it('keeps health traffic from consuming the authentication budget', async () => {
    const app = await createApp(false)

    for (let attempt = 0; attempt < 60; attempt += 1) {
      expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200)
    }
    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect((await app.inject({ method: 'POST', url: '/api/auth/sign-in/email' })).statusCode).toBe(204)
    }

    expect((await app.inject({ method: 'POST', url: '/api/auth/sign-in/email' })).statusCode).toBe(429)
  })

  it('keys requests by the forwarded client only when a proxy hop is trusted', async () => {
    const trustedApp = await createApp(true)
    for (let attempt = 0; attempt < 60; attempt += 1) {
      expect((await trustedApp.inject({
        method: 'GET',
        url: '/health',
        headers: { 'x-forwarded-for': '198.51.100.10' },
      })).statusCode).toBe(200)
    }
    expect((await trustedApp.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-forwarded-for': '198.51.100.11' },
    })).statusCode).toBe(200)

    const untrustedApp = await createApp(false)
    for (let attempt = 0; attempt < 60; attempt += 1) {
      expect((await untrustedApp.inject({
        method: 'GET',
        url: '/health',
        headers: { 'x-forwarded-for': '198.51.100.10' },
      })).statusCode).toBe(200)
    }
    expect((await untrustedApp.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-forwarded-for': '198.51.100.11' },
    })).statusCode).toBe(429)
  })
})
