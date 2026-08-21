import { describe, expect, it } from 'vitest'
import { envSchema } from './env.js'

const baseEnvironment = {
  NODE_ENV: 'development',
  API_HOST: '127.0.0.1',
  API_PORT: '4000',
  WEB_ORIGIN: 'http://localhost:5173',
  MONGODB_URI: 'mongodb://127.0.0.1:27017',
  MONGODB_DB_NAME: 'volt',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:4000',
}

describe('environment URL security', () => {
  it('allows HTTP URLs during development', () => {
    const result = envSchema.safeParse(baseEnvironment)

    expect(result.success).toBe(true)
  })

  it('rejects HTTP URLs in production', () => {
    const result = envSchema.safeParse({
      ...baseEnvironment,
      NODE_ENV: 'production',
    })

    expect(result.success).toBe(false)
    if (result.success) {
      return
    }

    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ['WEB_ORIGIN'],
          message: 'WEB_ORIGIN must use HTTPS in production',
        }),
        expect.objectContaining({
          path: ['BETTER_AUTH_URL'],
          message: 'BETTER_AUTH_URL must use HTTPS in production',
        }),
      ]),
    )
  })

  it('accepts HTTPS URLs in production', () => {
    const result = envSchema.safeParse({
      ...baseEnvironment,
      NODE_ENV: 'production',
      WEB_ORIGIN: 'https://volt.example',
      BETTER_AUTH_URL: 'https://api.volt.example',
    })

    expect(result.success).toBe(true)
  })
})
