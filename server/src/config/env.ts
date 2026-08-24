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

    if (values.TRUST_PROXY !== true) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['TRUST_PROXY'],
        message: 'TRUST_PROXY must be true in production (behind Render proxy)',
      })
    }
  })

export type Env = z.infer<typeof envSchema>

export function parseEnvironment(input: unknown): Env {
  return envSchema.parse(input)
}

export const env = parseEnvironment(process.env)
