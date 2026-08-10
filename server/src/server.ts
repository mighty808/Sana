import http from 'node:http'
import app from './app.js'
import { env } from './config/env.js'
import { connectDB } from './config/db.js'
import { initSocket } from './config/socket.js'
import { logger } from './utils/logger.js'

// Entry point for the backend process (run via `npm run dev` / `npm start`).
// Responsible for start-up ORDER: DB must be connected before we accept
// requests, since almost every route touches MongoDB.
async function main() {
  // Connect to MongoDB first — if this fails (bad URI, network issue,
  // wrong password), we want to fail fast instead of serving requests
  // that would all error out anyway.
  await connectDB()

  // Wrap the Express app in a plain Node HTTP server ourselves (rather than
  // calling app.listen()) so we can attach Socket.IO to the SAME server —
  // both REST and WebSocket traffic share one port.
  const server = http.createServer(app)
  initSocket(server)

  server.listen(env.port, () => {
    logger.info(`Sana API listening on http://localhost:${env.port}`)
  })
}

// Top-level error handling: if startup itself fails (e.g. DB connection
// error), log it clearly and exit with a non-zero code so process managers
// (or a developer watching the terminal) know it crashed rather than hanging.
main().catch((err) => {
  logger.error('Fatal startup error', err)
  process.exit(1)
})
