import { buildApp } from './app.js'
import { env } from './config/env.js'
import { connectToMongo, disconnectFromMongo, getMongoDb } from './db/mongo.js'
import { initializeVoltDatabase } from './db/collections.js'

async function startApi(): Promise<void> {
  await connectToMongo()
  await initializeVoltDatabase(getMongoDb())
  const app = await buildApp()
  await app.listen({ host: env.API_HOST, port: env.API_PORT })

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'Shutting down API')
    await app.close()
    await disconnectFromMongo()
  }

  process.once('SIGINT', () => {
    void shutdown('SIGINT')
  })
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM')
  })
}

void startApi().catch(async (error: unknown) => {
  console.error('API failed to start', error)
  await disconnectFromMongo()
  process.exitCode = 1
})
