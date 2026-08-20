/**
 * Structured logging for the worker.
 *
 * One JSON object per line, so a log shipper can parse it without a grok
 * pattern. Every entry carries the service, a level, an event name and a
 * timestamp; contextual fields such as `runId` and `organisationId` are attached
 * once with `child()` rather than repeated at each call site.
 *
 * Values are redacted on the way out. The worker handles invitation tokens,
 * connection strings and session cookies, and a log line is the easiest place
 * for one of those to escape — so redaction is applied by key name at any depth,
 * and by value shape for things that look like credentials whatever they are
 * called.
 *
 * Logging never throws. A worker that died because stdout was closed, or because
 * somebody passed a circular object, would be a worse failure than the one it
 * was trying to report.
 */

export const REDACTED = '[redacted]'

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const

export type LogLevel = (typeof LOG_LEVELS)[number]

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

/** Key fragments that mark a value as secret, matched case- and separator-insensitively. */
const SECRET_KEY_FRAGMENTS = [
  'token',
  'password',
  'secret',
  'apikey',
  'authorization',
  'cookie',
  'credential',
  'passphrase',
  'privatekey',
  'uri',
  'connectionstring',
  'dsn',
]

/** A credential-bearing URI, whatever key it arrives under. */
const CONNECTION_STRING = /^[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/i

/** Guards against a cyclic or pathologically deep object. */
const MAX_DEPTH = 8

export type LogFields = Record<string, unknown>

export interface Logger {
  debug: (event: string, fields?: LogFields) => void
  info: (event: string, fields?: LogFields) => void
  warn: (event: string, fields?: LogFields) => void
  error: (event: string, fields?: LogFields) => void
  /** Returns a logger that attaches these fields to every entry. */
  child: (fields: LogFields) => Logger
}

export interface LoggerOptions {
  service: string
  level?: LogLevel
  /** Defaults to stdout. Injected in tests. */
  sink?: (line: string) => void
}

function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function isSecretKey(key: string): boolean {
  const normalised = normaliseKey(key)
  return SECRET_KEY_FRAGMENTS.some((fragment) => normalised.includes(fragment))
}

function serialiseError(error: Error): LogFields {
  const code = (error as { code?: unknown }).code
  return {
    name: error.name,
    message: error.message,
    // Deliberately no stack: it is noisy in aggregate and can quote arguments.
    ...(typeof code === 'string' || typeof code === 'number' ? { code } : {}),
  }
}

/** Applies the redaction rules to one key/value pair. Exported for reuse. */
export function redactValue(key: string, value: unknown, depth = 0): unknown {
  if (isSecretKey(key)) return REDACTED
  if (depth >= MAX_DEPTH) return '[truncated]'

  if (typeof value === 'string') {
    return CONNECTION_STRING.test(value) ? REDACTED : value
  }

  if (value instanceof Error) return serialiseError(value)
  if (value instanceof Date) return value.toISOString()

  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(key, entry, depth + 1))
  }

  if (typeof value === 'object' && value !== null) {
    const result: LogFields = {}
    for (const [childKey, childValue] of Object.entries(value)) {
      result[childKey] = redactValue(childKey, childValue, depth + 1)
    }
    return result
  }

  return value
}

function redactFields(fields: LogFields): LogFields {
  const result: LogFields = {}
  for (const [key, value] of Object.entries(fields)) {
    result[key] = redactValue(key, value)
  }
  return result
}

function defaultSink(line: string): void {
  process.stdout.write(`${line}\n`)
}

function build(options: LoggerOptions, context: LogFields): Logger {
  const sink = options.sink ?? defaultSink
  const threshold = LEVEL_ORDER[options.level ?? 'info']

  const write = (level: LogLevel, event: string, fields: LogFields = {}): void => {
    if (LEVEL_ORDER[level] < threshold) return

    try {
      const entry = {
        time: new Date().toISOString(),
        level,
        service: options.service,
        event,
        ...redactFields(context),
        ...redactFields(fields),
      }
      sink(JSON.stringify(entry))
    } catch {
      // Reporting a problem must never become one. Try a minimal line, then
      // give up rather than propagate.
      try {
        sink(JSON.stringify({ time: new Date().toISOString(), level, service: options.service, event }))
      } catch {
        // Nothing further to be done; the caller's work matters more.
      }
    }
  }

  return {
    debug: (event, fields) => write('debug', event, fields),
    info: (event, fields) => write('info', event, fields),
    warn: (event, fields) => write('warn', event, fields),
    error: (event, fields) => write('error', event, fields),
    child: (fields) => build(options, { ...context, ...fields }),
  }
}

export function createLogger(options: LoggerOptions): Logger {
  return build(options, {})
}

/** A logger that discards everything, for tests and for quiet runs. */
export function createSilentLogger(): Logger {
  return createLogger({ service: 'silent', level: 'error', sink: () => undefined })
}
