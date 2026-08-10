import type { Server as HttpServer } from 'node:http'
import { Server } from 'socket.io'
import jwt from 'jsonwebtoken'
import { env } from './env.js'
import { User } from '../models/User.js'

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
