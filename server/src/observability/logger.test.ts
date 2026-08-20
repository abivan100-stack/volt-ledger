import { describe, expect, it, vi } from 'vitest'
import { REDACTED, createLogger, redactValue } from './logger.js'

/**
 * Structured logging for the worker.
 *
 * The redaction rules carry the most weight: the worker handles invitation
 * tokens, connection strings and session cookies, and a log line is the easiest
 * place for one to escape. Redaction is therefore tested by key name, by nesting
 * depth, and by the shape of the value.
 */

function capture() {
  const lines: string[] = []
  return { lines, sink: (line: string) => lines.push(line) }
}

function parse(line: string): Record<string, unknown> {
  return JSON.parse(line) as Record<string, unknown>
}

describe('createLogger', () => {
  it('writes one JSON object per line', () => {
    const { lines, sink } = capture()
    const logger = createLogger({ service: 'volt-worker', sink })

    logger.info('worker.started', { pollIntervalMs: 1000 })

    expect(lines).toHaveLength(1)
    expect(lines[0]).not.toContain('\n')
    const entry = parse(lines[0] as string)
    expect(entry.level).toBe('info')
    expect(entry.event).toBe('worker.started')
    expect(entry.service).toBe('volt-worker')
    expect(entry.pollIntervalMs).toBe(1000)
  })

  it('timestamps every entry', () => {
    const { lines, sink } = capture()
    createLogger({ service: 'volt-worker', sink }).info('worker.started')

    const entry = parse(lines[0] as string)
    expect(typeof entry.time).toBe('string')
    expect(Number.isNaN(Date.parse(entry.time as string))).toBe(false)
  })

  it('supports each level', () => {
    const { lines, sink } = capture()
    const logger = createLogger({ service: 'volt-worker', sink, level: 'debug' })

    logger.debug('a')
    logger.info('b')
    logger.warn('c')
    logger.error('d')

    expect(lines.map((line) => parse(line).level)).toEqual(['debug', 'info', 'warn', 'error'])
  })

  it('defaults to info, so debug output does not escape by accident', () => {
    const { lines, sink } = capture()
    const logger = createLogger({ service: 'volt-worker', sink })

    logger.debug('a')
    logger.info('b')

    expect(lines.map((line) => parse(line).event)).toEqual(['b'])
  })

  it('drops entries below the configured level', () => {
    const { lines, sink } = capture()
    const logger = createLogger({ service: 'volt-worker', sink, level: 'warn' })

    logger.debug('a')
    logger.info('b')
    logger.warn('c')
    logger.error('d')

    expect(lines.map((line) => parse(line).event)).toEqual(['c', 'd'])
  })

  it('carries child context onto every entry', () => {
    const { lines, sink } = capture()
    const logger = createLogger({ service: 'volt-worker', sink })
    const scoped = logger.child({ runId: 'run_1', organisationId: 'org_1' })

    scoped.info('simulation.completed', { durationMs: 12 })

    const entry = parse(lines[0] as string)
    expect(entry.runId).toBe('run_1')
    expect(entry.organisationId).toBe('org_1')
    expect(entry.durationMs).toBe(12)
  })

  it('merges nested child context without losing the outer scope', () => {
    const { lines, sink } = capture()
    const logger = createLogger({ service: 'volt-worker', sink })

    logger.child({ organisationId: 'org_1' }).child({ runId: 'run_1' }).info('claimed')

    const entry = parse(lines[0] as string)
    expect(entry.organisationId).toBe('org_1')
    expect(entry.runId).toBe('run_1')
  })

  it('serialises an error as message, name and code but never a raw stack', () => {
    const { lines, sink } = capture()
    const logger = createLogger({ service: 'volt-worker', sink })

    logger.error('simulation.failed', { error: new Error('SIMULATION_INPUT_DIGEST_MISMATCH') })

    const entry = parse(lines[0] as string)
    const error = entry.error as Record<string, unknown>
    expect(error.message).toBe('SIMULATION_INPUT_DIGEST_MISMATCH')
    expect(error.name).toBe('Error')
    expect(error).not.toHaveProperty('stack')
  })

  it('never throws out of a logging call', () => {
    const failing = vi.fn(() => {
      throw new Error('stdout closed')
    })
    const logger = createLogger({ service: 'volt-worker', sink: failing })

    // A worker must not die because a log line could not be written.
    expect(() => logger.info('worker.started')).not.toThrow()
  })

  it('survives a value that cannot be serialised', () => {
    const { lines, sink } = capture()
    const logger = createLogger({ service: 'volt-worker', sink })
    const circular: Record<string, unknown> = {}
    circular.self = circular

    expect(() => logger.info('odd', { circular })).not.toThrow()
    expect(lines).toHaveLength(1)
  })
})

describe('redaction', () => {
  it('redacts values whose key names a secret', () => {
    const { lines, sink } = capture()
    const logger = createLogger({ service: 'volt-worker', sink })

    logger.info('invitation.created', {
      token: 'inv_9f2c',
      tokenHash: 'abc123',
      password: 'hunter2',
      secret: 's',
      apiKey: 'k',
      authorization: 'Bearer x',
      cookie: 'session=1',
      mongodbUri: 'mongodb+srv://user:pw@host/db',
    })

    const entry = parse(lines[0] as string)
    for (const key of [
      'token',
      'tokenHash',
      'password',
      'secret',
      'apiKey',
      'authorization',
      'cookie',
      'mongodbUri',
    ]) {
      expect(entry[key], key).toBe(REDACTED)
    }
  })

  it('matches secret keys whatever their casing or separator', () => {
    const { lines, sink } = capture()
    const logger = createLogger({ service: 'volt-worker', sink })

    logger.info('e', { API_KEY: 'a', 'access-token': 'b', SessionToken: 'c', BETTER_AUTH_SECRET: 'd' })

    const entry = parse(lines[0] as string)
    expect(entry.API_KEY).toBe(REDACTED)
    expect(entry['access-token']).toBe(REDACTED)
    expect(entry.SessionToken).toBe(REDACTED)
    expect(entry.BETTER_AUTH_SECRET).toBe(REDACTED)
  })

  it('redacts inside nested objects and arrays', () => {
    const { lines, sink } = capture()
    const logger = createLogger({ service: 'volt-worker', sink })

    logger.info('e', {
      outer: { inner: { token: 'secret-value' } },
      list: [{ password: 'p' }],
    })

    const serialised = lines[0] as string
    expect(serialised).not.toContain('secret-value')
    expect(serialised).not.toContain('"p"')
  })

  it('redacts a connection string even under an innocent key', () => {
    const { lines, sink } = capture()
    const logger = createLogger({ service: 'volt-worker', sink })

    logger.info('e', { target: 'mongodb+srv://user:pw@cluster.example.net/db' })

    const serialised = lines[0] as string
    expect(serialised).not.toContain('pw@')
    expect(parse(serialised).target).toBe(REDACTED)
  })

  it('leaves ordinary operational values intact', () => {
    const { lines, sink } = capture()
    const logger = createLogger({ service: 'volt-worker', sink })

    logger.info('simulation.completed', {
      runId: 'run_1',
      organisationId: 'org_1',
      durationMs: 42,
      queueDepth: 3,
      status: 'completed',
    })

    const entry = parse(lines[0] as string)
    expect(entry.runId).toBe('run_1')
    expect(entry.organisationId).toBe('org_1')
    expect(entry.durationMs).toBe(42)
    expect(entry.queueDepth).toBe(3)
    expect(entry.status).toBe('completed')
  })

  it('redacts secrets carried in child context too', () => {
    const { lines, sink } = capture()
    const logger = createLogger({ service: 'volt-worker', sink })

    logger.child({ token: 'inv_9f2c' }).info('e')

    expect(parse(lines[0] as string).token).toBe(REDACTED)
  })
})

describe('redactValue', () => {
  it('is exposed so other layers can reuse the same rules', () => {
    expect(redactValue('token', 'abc')).toBe(REDACTED)
    expect(redactValue('runId', 'abc')).toBe('abc')
  })

  it('caps runaway nesting rather than recursing forever', () => {
    let deep: Record<string, unknown> = { token: 'x' }
    for (let index = 0; index < 50; index += 1) deep = { nested: deep }

    expect(() => redactValue('payload', deep)).not.toThrow()
  })
})
