import http from 'node:http'
import app from './app.js'
import { env } from './config/env.js'
import { connectDB } from './config/db.js'
import { initSocket } from './config/socket.js'
import { logger } from './utils/logger.js'

async function main() {
  await connectDB()

  const server = http.createServer(app)
  initSocket(server)

  server.listen(env.port, () => {
    logger.info(`Sana API listening on http://localhost:${env.port}`)
  })
}

main().catch((err) => {
  logger.error('Fatal startup error', err)
  process.exit(1)
})
