import { env } from './config/env.js'
import { connectToMongo, disconnectFromMongo, getMongoDb } from './db/mongo.js'
import { initializeVoltDatabase } from './db/collections.js'
import { createVoltRepositories, simulationMaxAttempts } from './db/repositories.js'
import { getEmailDeliveryConfigurationError } from './email/config.js'
import { createLogger, type LogLevel } from './observability/logger.js'
import { runSimulationWorker } from './simulations/worker.js'

const logger = createLogger({
  service: 'volt-worker',
  level: (process.env.LOG_LEVEL as LogLevel | undefined) ?? 'info',
})

async function startWorker(): Promise<void> {
  const emailConfigurationError = getEmailDeliveryConfigurationError({
    nodeEnv: env.NODE_ENV,
    resendApiKey: env.RESEND_API_KEY,
    emailFrom: env.EMAIL_FROM,
    smtpHost: env.SMTP_HOST,
    smtpPort: env.SMTP_PORT,
    smtpUser: env.SMTP_USER,
    smtpPassword: env.SMTP_PASSWORD,
  })
  if (emailConfigurationError) {
    throw new Error(`EMAIL_DELIVERY_CONFIGURATION_INVALID: ${emailConfigurationError}`)
  }

  await connectToMongo()
  await initializeVoltDatabase(getMongoDb())

  const controller = new AbortController()
  const requestShutdown = (signal: string) => (): void => {
    // Aborting lets the current run finish and the loop exit cleanly, rather
    // than dropping a lease mid-flight.
    logger.info('worker.shutdown_requested', { signal })
    controller.abort()
  }

  process.once('SIGINT', requestShutdown('SIGINT'))
  process.once('SIGTERM', requestShutdown('SIGTERM'))

  const repositories = createVoltRepositories(getMongoDb())

  try {
    await runSimulationWorker(repositories, {
      signal: controller.signal,
      logger,
      maxAttempts: simulationMaxAttempts,
      retentionWindowDays: env.RETENTION_WINDOW_DAYS,
      // This process has no HTTP surface, so the heartbeat is the only evidence
      // it is alive. Storage is bound here rather than inside the loop.
      heartbeat: async (snapshot) => {
        await repositories.workers.recordHeartbeat({ workerId: env.WORKER_ID, ...snapshot })
      },
    })
  } finally {
    await disconnectFromMongo()
    logger.info('worker.disconnected')
  }
}

void startWorker().catch(async (error: unknown) => {
  // Only startup and shutdown reach here; the loop itself survives transient
  // failures rather than propagating them.
  logger.error('worker.crashed', { error })
  await disconnectFromMongo().catch(() => undefined)
  process.exitCode = 1
})
