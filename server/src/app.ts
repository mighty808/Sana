import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import swaggerUi from 'swagger-ui-express'
import { env } from './config/env.js'
import routes from './routes/index.js'
import { errorHandler } from './middleware/errorHandler.js'
import { sanitize } from './middleware/sanitize.js'
import { swaggerSpec } from './config/swagger.js'

// Builds and configures the Express app object. Kept separate from server.ts
// (which actually starts listening) so the app can be imported directly by
// test files (Supertest) without opening a real network port.
const app = express()

// Sets a batch of security-related HTTP response headers (e.g. disabling
// MIME-sniffing, hiding the X-Powered-By header) as a baseline defense.
app.use(helmet())

// Only allow browser requests from our own frontend origin, and allow
// cookies (the refresh token) to be sent cross-origin between the Vite dev
// server (5173) and this API (3000).
app.use(cors({ origin: env.clientUrl, credentials: true }))

// Parses incoming JSON request bodies into req.body.
app.use(express.json())

// Parses the Cookie header into req.cookies (used to read the refresh token cookie).
app.use(cookieParser())

// Strips MongoDB operator injection attempts ($gt, $where, etc.) out of
// req.body/req.params on every request, before any route handler runs.
app.use(sanitize)

// Interactive API docs, generated from @openapi JSDoc comments on route
// files (see config/swagger.ts). Given its own relaxed helmet() call
// (contentSecurityPolicy disabled) because the Swagger UI page relies on
// inline scripts/styles that the strict global CSP set above would block —
// this override only applies to requests under /api/docs, everywhere else
// keeps the strict policy.
app.use('/api/docs', helmet({ contentSecurityPolicy: false }), swaggerUi.serve, swaggerUi.setup(swaggerSpec))

// All API routes live under /api/v1 — see routes/index.ts for the full list.
app.use('/api/v1', routes)

// Must be registered LAST — Express only treats a 4-argument middleware as
// an error handler, and it only catches errors thrown by handlers registered before it.
app.use(errorHandler)

export default app
