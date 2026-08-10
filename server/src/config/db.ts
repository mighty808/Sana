import mongoose from 'mongoose'
import { env } from './env.js'
import { logger } from '../utils/logger.js'

// Opens the MongoDB connection used by every Mongoose model in the app.
// Called once, at server startup, before we start listening for HTTP requests.
export async function connectDB() {
  // 'strictQuery' makes Mongoose reject query filters that reference fields
  // not defined in the schema, catching typos in query code early.
  mongoose.set('strictQuery', true)

  // Connect using the URI from env config (local mongod in dev, Atlas in this project).
  await mongoose.connect(env.mongoUri)

  // Log which host we actually connected to, useful for confirming Atlas vs local.
  logger.info(`MongoDB connected: ${mongoose.connection.host}`)
}
