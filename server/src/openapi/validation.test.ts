import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { Validator } from '@seriousme/openapi-schema-validator'
import { buildApp } from '../app.js'
import { buildOpenApiDocument } from './document.js'
import { checkCommittedDocument, normaliseNewlines } from './check.js'

/**
 * Validates the generated document against the official OpenAPI meta-schema,
 * rather than only against this repository's own expectations. Hand-rolled
 * assertions cannot catch a misplaced keyword or an invalid `format`; the real
 * specification can.
 */

describe('specification validity', () => {
  it('validates against the OpenAPI 3.1 meta-schema', async () => {
    const validator = new Validator()
    const result = await validator.validate(buildOpenApiDocument())

    // Surface the actual errors rather than a bare "false".
    expect(result.errors ?? [], JSON.stringify(result.errors, null, 2)).toEqual([])
    expect(result.valid).toBe(true)
    expect(validator.version).toBe('3.1')
  })

  it('still validates when built for a published server', async () => {
    const validator = new Validator()
    const result = await validator.validate(
      buildOpenApiDocument({ serverUrl: 'https://api.volt.example', version: '2.3.4' }),
    )
    expect(result.valid).toBe(true)
  })

  it('resolves every internal reference', async () => {
    const validator = new Validator()
    await validator.validate(buildOpenApiDocument())
    const resolved = await validator.resolveRefs()
    expect(resolved).toBeTruthy()
  })
})

describe('committed document', () => {
  it('matches what the code generates', async () => {
    const result = await checkCommittedDocument()
    expect(result.reason ?? 'up to date').toBe('up to date')
    expect(result.upToDate).toBe(true)
  })

  it('reports a missing file with the command that fixes it', async () => {
    const result = await checkCommittedDocument('does-not-exist.json')
    expect(result.upToDate).toBe(false)
    expect(result.reason).toMatch(/npm run openapi:write/)
  })

  it('ignores line-ending differences, which a Windows checkout introduces', () => {
    // Built from character codes so the literals cannot be mistaken for one another.
    const cr = String.fromCharCode(13)
    const lf = String.fromCharCode(10)
    const withCrlf = `{${cr}${lf}  ok${cr}${lf}}${cr}${lf}`
    const withLf = `{${lf}  ok${lf}}${lf}`

    expect(normaliseNewlines(withCrlf)).toBe(withLf)
    expect(normaliseNewlines(withLf)).toBe(withLf)
  })
})

describe('the served document', () => {
  const apps: FastifyInstance[] = []

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()))
  })

  it('is available without a session, because clients need it before they have one', async () => {
    const app = await buildApp({
      logger: false,
      auth: {
        handle: async () => new Response(null, { status: 204 }),
        createVerificationCode: async () => '123456',
        getSession: async () => null,
      },
      databasePing: async () => undefined,
    })
    apps.push(app)

    const response = await app.inject({ method: 'GET', url: '/openapi.json' })

    expect(response.statusCode).toBe(200)
    const served = response.json() as { openapi: string; paths: Record<string, unknown> }
    expect(served.openapi).toBe('3.1.0')
    expect(Object.keys(served.paths).length).toBeGreaterThan(15)

    const validator = new Validator()
    expect((await validator.validate(served)).valid).toBe(true)
  })
})
