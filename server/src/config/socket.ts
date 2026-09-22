import type { Server as HttpServer } from 'node:http'
import { Server } from 'socket.io'
import jwt from 'jsonwebtoken'
import { env } from './env.js'
import { User } from '../models/User.js'
import { logger } from '../utils/logger.js'

// Module-level reference to the Socket.IO server instance.
// Kept here (instead of passed around everywhere) so any service file can
// call getIO() to emit real-time events without needing it injected.
let io: Server

// Attaches Socket.IO to the same HTTP server the Express app listens on,
// and sets up authentication + room assignment for every connecting socket.
export function initSocket(httpServer: HttpServer) {
  io = new Server(httpServer, {
    // Only allow browser connections from our own frontend origin, and
    // allow cookies/credentials to be sent (needed for auth).
    cors: { origin: env.clientUrl, credentials: true },
  })

  // Runs once per incoming socket connection, before 'connection' fires.
  // The client must send its JWT access token in the handshake so we know
  // who is connecting — this mirrors the HTTP `auth` middleware but for sockets.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined
      if (!token) return next(new Error('Unauthorized'))

      // The access token only carries `{ id }` (see auth.service.ts's
      // signAccessToken) — deliberately no `role` claim, for the same reason
      // the HTTP `auth` middleware re-fetches the user instead of trusting
      // token data: so a role/permission change takes effect immediately
      // instead of only once the token expires. So look the user up here too,
      // rather than reading a `role` field off the decoded token that was
      // never actually put there.
      const decoded = jwt.verify(token, env.jwtAccessSecret) as { id: string }
      const user = await User.findById(decoded.id).populate('role')
      if (!user || user.status !== 'ACTIVE') return next(new Error('Unauthorized'))

      // Stash the identified user's id/role on the socket for later use
      // (e.g. room assignment below, or permission checks in event handlers).
      socket.data.userId = user.id
      socket.data.role = (user.role as unknown as { name: string }).name
      next()
    } catch {
      // Invalid/expired/missing token, or the DB lookup failed — reject the connection outright.
      next(new Error('Unauthorized'))
    }
  })

  // Once authenticated, put each socket into two rooms:
  // - `user:{id}` lets us push events to one specific user (e.g. "your lab result is ready")
  // - `role:{role}` lets us broadcast to everyone with a given role (e.g. all doctors)
  io.on('connection', (socket) => {
    socket.join(`user:${socket.data.userId}`)
    socket.join(`role:${socket.data.role}`)
  })

  return io
}

// Lets any other file (services, controllers) grab the initialized Socket.IO
// server to emit events, e.g. `getIO().to('user:123').emit('lab.result.ready', ...)`.
export function getIO(): Server {
  if (!io) throw new Error('Socket.IO not initialized')
  return io
}

// Whether a Socket.IO server exists to emit through. Callers that merely want
// to push a live hint use this to skip the work entirely, rather than calling
// getIO() and treating the throw as control flow — an absent server is an
// ordinary condition here, not an error.
export function isSocketReady(): boolean {
  return io !== null && io !== undefined
}

// Debounces broadcastWardBoardChanged calls below into one emit per short
// window, instead of one per write. On a busy ward, several vitals/
// diagnosis/acuity writes can land within milliseconds of each other across
// different encounters — without this, each one would independently push
// every connected Admin/Doctor/Nurse client into refetching the whole ward
// board, a thundering herd triggered by unrelated single-patient edits.
// Coalescing them into one emit (carrying every changed encounter id from
// the window) cuts that down to one refetch per client per window instead
// of one per write.
const WARD_BOARD_DEBOUNCE_MS = 400
let pendingWardBoardEncounterIds: Set<string> | null = null
let wardBoardDebounceTimer: NodeJS.Timeout | null = null

function flushWardBoardBroadcast() {
  wardBoardDebounceTimer = null
  const encounterIds = pendingWardBoardEncounterIds ? [...pendingWardBoardEncounterIds] : []
  pendingWardBoardEncounterIds = null
  try {
    getIO().to('role:ADMIN').to('role:DOCTOR').to('role:NURSE').emit('ward-board.changed', { encounterIds })
  } catch (err) {
    logger.error('Failed to broadcast ward-board.changed', err)
  }
}

// Tells every connected Admin/Doctor/Nurse (the roles that can see the Ward
// Board — see types/permissions.ts's 'encounter.read') that something on it
// may have changed, so their client can refetch GET /encounters/ward-board
// instead of waiting for its 30s poll. This is deliberately NOT a persisted
// Notification (see notification.service.ts's notify()) — it's just a live
// "go refresh" trigger, nothing to read/dismiss later, so it isn't written
// to the database. The actual emit is debounced (see above); scheduling the
// timer itself is wrapped in try/catch so a Socket.IO hiccup here can never
// break the request that triggered it (vitals/diagnosis/acuity/completion
// all still need to succeed either way).
export function broadcastWardBoardChanged(encounterId: string) {
  // No Socket.IO means no server is running, so there is nobody to tell.
  // Returning here rather than scheduling a timer that will fail 400ms later
  // is both cheaper and quieter — and it is what keeps the Jest suite green:
  // the services under test call this freely, the debounce timer outlived the
  // test file that triggered it, and the resulting `logger.error` landed after
  // teardown. Jest reports that as "Cannot log after tests are done" and exits
  // non-zero even when every test passed, which is exactly what it did in CI:
  // 279 passed, 25 suites green, process exit 1.
  //
  // This is not a test-only accommodation. "Not initialized" is a normal state
  // outside a live server (scripts, seeds, one-off jobs), and none of those
  // want an error logged for a broadcast nobody was waiting for.
  if (!isSocketReady()) return

  try {
    if (!pendingWardBoardEncounterIds) pendingWardBoardEncounterIds = new Set()
    pendingWardBoardEncounterIds.add(encounterId)
    if (!wardBoardDebounceTimer) {
      wardBoardDebounceTimer = setTimeout(flushWardBoardBroadcast, WARD_BOARD_DEBOUNCE_MS)
      // Don't let a pending broadcast hold the event loop open — a debounced
      // "go refresh" hint is never a reason to delay a process shutting down.
      wardBoardDebounceTimer.unref?.()
    }
  } catch (err) {
    logger.error('Failed to schedule ward-board.changed broadcast', err)
  }
}
