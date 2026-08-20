import { connectToMongo, disconnectFromMongo, getMongoDb } from './db/mongo.js'
import { initializeVoltDatabase } from './db/collections.js'
import { createVoltRepositories } from './db/repositories.js'
import { runSimulationWorker } from './simulations/worker.js'

async function startWorker(): Promise<void> {
  await connectToMongo()
  await initializeVoltDatabase(getMongoDb())

  const controller = new AbortController()
  const requestShutdown = (): void => controller.abort()

  process.once('SIGINT', requestShutdown)
  process.once('SIGTERM', requestShutdown)

  try {
    await runSimulationWorker(createVoltRepositories(getMongoDb()), { signal: controller.signal })
  } finally {
    await disconnectFromMongo()
  }
}

void startWorker().catch(async (error: unknown) => {
  console.error('Simulation worker failed', error)
  await disconnectFromMongo()
  process.exitCode = 1
})
