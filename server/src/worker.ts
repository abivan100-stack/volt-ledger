import { connectToMongo, disconnectFromMongo, getMongoDb } from './db/mongo.js'
import { initializeVoltDatabase } from './db/collections.js'
import { createVoltRepositories } from './db/repositories.js'
import { createLogger, type LogLevel } from './observability/logger.js'
import { runSimulationWorker } from './simulations/worker.js'

const logger = createLogger({
  service: 'volt-worker',
  level: (process.env.LOG_LEVEL as LogLevel | undefined) ?? 'info',
})

async function startWorker(): Promise<void> {
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

  try {
    await runSimulationWorker(createVoltRepositories(getMongoDb()), {
      signal: controller.signal,
      logger,
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
