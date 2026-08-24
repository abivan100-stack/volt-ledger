import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { z } from 'zod'

const envPath = fileURLToPath(new URL('../../.env', import.meta.url))
dotenv.config({ path: envPath })

const optionalString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().min(1).optional(),
)

const optionalPort = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.coerce.number().int().min(1).max(65535).optional(),
)

const trustProxy = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
  z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
)

const demoPersistenceEnabled = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
  z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
)

const serveWeb = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
  z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
)

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_HOST: z.string().min(1).default('127.0.0.1'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    PORT: optionalPort,
    TRUST_PROXY: trustProxy,
    WEB_ORIGIN: z.string().url(),

    MONGODB_URI: z.string().min(1),
    MONGODB_DB_NAME: z.string().min(1),
    VOLT_DNS_SERVERS: optionalString,

    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().url(),
    SIMULATION_DAILY_RUN_LIMIT: z.coerce.number().int().min(1).max(10_000).default(100),
    SIMULATION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(50).default(5),
    WORKER_ID: z.string().min(1).default('volt-worker'),
    RETENTION_WINDOW_DAYS: z.coerce.number().int().min(1).max(3650).default(30),

    // The public demo writes without a session, so it needs a switch that does
    // not depend on shipping new client code: setting this to false makes the
    // ingest routes refuse politely and the browser fall back to running purely
    // in memory, exactly as it does with no API configured at all.
    DEMO_PERSISTENCE_ENABLED: demoPersistenceEnabled,
    // Days a demo session's data survives before its TTL indexes remove it.
    DEMO_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),

    // Serve the built browser bundle from this process, putting the site and
    // the API on one origin. Off by default: the two-origin deployment is still
    // the normal one, and an API that quietly started serving HTML would be a
    // surprise rather than a feature.
    SERVE_WEB: serveWeb,

    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,

    RESEND_API_KEY: optionalString,
    EMAIL_FROM: optionalString,
    SMTP_HOST: optionalString,
    SMTP_PORT: optionalPort,
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString,
  })
  .superRefine((values, context) => {
    if (values.NODE_ENV !== 'production') {
      return
    }

    for (const field of ['WEB_ORIGIN', 'BETTER_AUTH_URL'] as const) {
      if (new URL(values[field]).protocol !== 'https:') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} must use HTTPS in production`,
        })
      }
    }
  })

export type Env = z.infer<typeof envSchema>

/**
 * What each setting is for, in the words someone deploying would need.
 *
 * Only the ones with no default appear here: those are the settings a
 * deployment must supply, and therefore the ones somebody is going to get
 * wrong at three in the morning while reading a platform's log viewer.
 */
const SETTING_HINTS: Record<string, string> = {
  MONGODB_URI: 'Connection string for a MongoDB replica set, e.g. mongodb+srv://user:password@cluster.mongodb.net/',
  MONGODB_DB_NAME: 'Database name to use on that cluster, e.g. volt',
  BETTER_AUTH_SECRET: 'A random string of at least 32 characters. Generate a fresh one per environment.',
  BETTER_AUTH_URL: "This API's own origin, e.g. https://volt-api.onrender.com. Must be HTTPS when NODE_ENV=production.",
  WEB_ORIGIN: 'The origin the browser loads the site from, e.g. https://volt-web.onrender.com. Must be HTTPS when NODE_ENV=production, and must match exactly; CORS is pinned to it.',
}

/**
 * Turns a schema failure into something an operator can act on.
 *
 * Zod's own report is a stack trace over a nested issue array, which in a
 * platform log viewer says little more than that something was undefined. What
 * a deployment needs is the name of every setting that is wrong, what is wrong
 * with it, and what a correct value looks like — all of it, not just the first
 * one, so a misconfigured environment takes one more deploy to fix rather than
 * one per missing variable.
 */
function describeEnvironmentFailure(error: z.ZodError): string {
  const lines = error.issues.map((issue) => {
    const name = issue.path.join('.') || '(root)'
    const missing = issue.code === 'invalid_type' && issue.message.includes('received undefined')
    const problem = missing ? 'is required but was not set' : issue.message
    const hint = SETTING_HINTS[name]
    return hint ? `  ${name}: ${problem}\n      ${hint}` : `  ${name}: ${problem}`
  })

  return [
    `Volt cannot start: ${error.issues.length} environment setting(s) are missing or invalid.`,
    '',
    ...lines,
    '',
    'Every setting and its default is listed in server/.env.example.',
  ].join('\n')
}

/** The origin settings a hosting platform can answer on a deployment's behalf. */
const PLATFORM_DEFAULTED = ['BETTER_AUTH_URL', 'WEB_ORIGIN'] as const

export interface PlatformDefaults {
  values: unknown
  /** Which settings the platform supplied, for reporting at startup. */
  defaulted: string[]
  /** The origin they were taken from. */
  origin: string | null
}

/**
 * Fills the two origin settings in from the platform, when it publishes one.
 *
 * Render exports `RENDER_EXTERNAL_URL` — the address the service is actually
 * reachable at. When one service serves both the site and the API, that address
 * is by definition the answer to both "where does this API live" and "where does
 * the browser load the site from", and requiring somebody to copy it into two
 * more variables only creates two more chances to mistype it.
 *
 * An explicit value always wins, because a deployment whose site is on another
 * origin needs to say so and the platform cannot know that.
 */
export function withPlatformDefaults(input: unknown): PlatformDefaults {
  if (typeof input !== 'object' || input === null) {
    return { values: input, defaulted: [], origin: null }
  }

  const values = input as Record<string, unknown>
  const external = values.RENDER_EXTERNAL_URL
  if (typeof external !== 'string' || external.trim() === '') {
    return { values: input, defaulted: [], origin: null }
  }

  const origin = external.trim().replace(/\/+$/, '')
  const filled: Record<string, unknown> = { ...values }
  const defaulted: string[] = []

  for (const key of PLATFORM_DEFAULTED) {
    const current = filled[key]
    if (typeof current === 'string' && current.trim() !== '') continue
    filled[key] = origin
    defaulted.push(key)
  }

  return { values: filled, defaulted, origin }
}

export function parseEnvironment(input: unknown): Env {
  const platform = withPlatformDefaults(input)
  const result = envSchema.safeParse(platform.values)
  if (!result.success) {
    throw new Error(describeEnvironmentFailure(result.error))
  }

  if (platform.defaulted.length > 0) {
    // Said out loud rather than left implicit: a setting nobody configured is
    // the first thing to suspect when requests start being refused.
    console.info(
      `Volt: ${platform.defaulted.join(' and ')} defaulted to this service's own address ` +
        `(${platform.origin}). Set them explicitly if the site is served from another origin.`,
    )
  }

  return result.data
}

export const env = parseEnvironment(process.env)
