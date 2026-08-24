import { describe, expect, it } from 'vitest'
import { envSchema, parseEnvironment } from './env.js'

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

/**
 * What a failed deployment reads in the log viewer.
 *
 * This is the only diagnostic anyone gets: the environment is parsed as the
 * module loads, so a wrong value stops the process before a single line of the
 * application runs. Zod's own report is a stack trace over a nested issue
 * array, which in a platform log viewer amounts to "something was undefined".
 */
describe('when the environment is wrong', () => {
  const { NODE_ENV: _node, ...production } = { ...baseEnvironment, NODE_ENV: 'production' }

  it('names every setting that is wrong, not just the first', () => {
    let message = ''
    try {
      parseEnvironment({ NODE_ENV: 'production', MONGODB_DB_NAME: 'volt' })
    } catch (error) {
      message = (error as Error).message
    }

    expect(message).toContain('MONGODB_URI')
    expect(message).toContain('BETTER_AUTH_SECRET')
    expect(message).toContain('BETTER_AUTH_URL')
    expect(message).toContain('WEB_ORIGIN')
  })

  it('says a missing setting is missing rather than mistyped', () => {
    let message = ''
    try {
      parseEnvironment({ ...production, NODE_ENV: 'production', BETTER_AUTH_URL: undefined })
    } catch (error) {
      message = (error as Error).message
    }

    // The failure that cost a real deploy read "expected string, received
    // undefined", which does not tell anybody what to go and set.
    expect(message).toContain('BETTER_AUTH_URL: is required but was not set')
  })

  it('shows what a correct value looks like', () => {
    let message = ''
    try {
      parseEnvironment({ NODE_ENV: 'production' })
    } catch (error) {
      message = (error as Error).message
    }

    expect(message).toContain('https://volt-api.onrender.com')
    expect(message).toContain('at least 32 characters')
    expect(message).toContain('server/.env.example')
  })

  it('still explains a value that is present but not allowed', () => {
    let message = ''
    try {
      parseEnvironment({ ...production, NODE_ENV: 'production' })
    } catch (error) {
      message = (error as Error).message
    }

    expect(message).toContain('WEB_ORIGIN must use HTTPS in production')
  })

  it('stays printable in a log viewer of unknown encoding', () => {
    let message = ''
    try {
      parseEnvironment({ NODE_ENV: 'production' })
    } catch (error) {
      message = (error as Error).message
    }

    // This text is read in a deploy log viewer, a CI job or a Windows console
    // at whatever codepage it happens to use. A typographic dash that arrives
    // as mojibake helps nobody who is already debugging a failed start.
    expect(message).toMatch(/^[\x20-\x7E\n]*$/)
  })

  it('returns the parsed environment when everything is right', () => {
    expect(parseEnvironment(baseEnvironment).MONGODB_DB_NAME).toBe('volt')
  })
})
