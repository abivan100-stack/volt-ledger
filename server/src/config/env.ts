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

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.string().url(),

  MONGODB_URI: z.string().min(1),
  MONGODB_DB_NAME: z.string().min(1),
  VOLT_DNS_SERVERS: optionalString,

  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  SIMULATION_DAILY_RUN_LIMIT: z.coerce.number().int().min(1).max(10_000).default(100),
  SIMULATION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(50).default(5),
  WORKER_ID: z.string().min(1).default('volt-worker'),

  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,

  RESEND_API_KEY: optionalString,
  EMAIL_FROM: optionalString,
  SMTP_HOST: optionalString,
  SMTP_PORT: optionalPort,
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
})

export const env = envSchema.parse(process.env)
export type Env = z.infer<typeof envSchema>
