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

// Trust the first hop in front of this server (a reverse proxy / load
// balancer in a real deployment) so `req.ip` reflects the actual client's
// IP from the X-Forwarded-For header, instead of the proxy's own IP.
// Without this, `loginRateLimiter`/`aiRateLimiter` (which key on req.ip —
// see middleware/rateLimiter.ts) would see every request as coming from the
// same address once deployed behind a proxy, so one user's failed logins
// would lock out every other user for the whole rate-limit window. `1`
// (not `true`) trusts only the immediate proxy hop, not an arbitrary chain
// — safer than trusting the whole X-Forwarded-For chain, which a client
// could otherwise spoof to fake its own IP.
app.set('trust proxy', 1)

// Interactive API docs, generated from @openapi JSDoc comments on route
// files (see config/swagger.ts). MUST be registered BEFORE the global
// helmet() below, not just given its own relaxed helmet() call after it —
// helmet's `contentSecurityPolicy: false` option means "don't touch the CSP
// header," not "clear whatever CSP header is already on the response." So a
// second helmet() call placed AFTER the global one (which already set a
// strict CSP) would leave that strict header in place, and the Swagger UI
// page's inline scripts/styles would still get blocked by it. Registering
// this route first means matching requests are handled here and the
// response is sent before the global helmet() ever runs, so no CSP header
// is set on this response at all — every other route still gets the strict
// policy from the global helmet() below, since only /api/docs matches here.
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec))

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

// All API routes live under /api/v1 — see routes/index.ts for the full list.
app.use('/api/v1', routes)

// Must be registered LAST — Express only treats a 4-argument middleware as
// an error handler, and it only catches errors thrown by handlers registered before it.
app.use(errorHandler)

export default app
