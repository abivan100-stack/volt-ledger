import { MongoClient, type Db } from 'mongodb'
import { env } from '../config/env.js'
import { applyDnsServers } from './setupDns.js'

let client: MongoClient | undefined
let database: Db | undefined
let connecting: Promise<Db> | undefined

async function openMongo(): Promise<Db> {
  applyDnsServers(env.VOLT_DNS_SERVERS)

  const nextClient = new MongoClient(env.MONGODB_URI, {
    appName: 'volt-ledger-api',
    connectTimeoutMS: 10_000,
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 10,
  })

  try {
    await nextClient.connect()
    const nextDatabase = nextClient.db(env.MONGODB_DB_NAME)
    await nextDatabase.command({ ping: 1 })
    client = nextClient
    database = nextDatabase
    return nextDatabase
  } catch (error) {
    await nextClient.close().catch(() => undefined)
    throw error
  }
}

export function connectToMongo(): Promise<Db> {
  if (database) return Promise.resolve(database)
  if (!connecting) {
    connecting = openMongo().finally(() => {
      connecting = undefined
    })
  }
  return connecting
}

export function getMongoDb(): Db {
  if (!database) {
    throw new Error('MongoDB is not connected. Call connectToMongo() during startup.')
  }
  return database
}

export function getMongoClient(): MongoClient {
  if (!client) {
    throw new Error('MongoDB is not connected. Call connectToMongo() during startup.')
  }
  return client
}

export async function disconnectFromMongo(): Promise<void> {
  const currentClient = client
  client = undefined
  database = undefined
  connecting = undefined
  if (currentClient) await currentClient.close()
}
