import { io, type Socket } from 'socket.io-client'
import { getAccessToken } from './api'

// One shared socket instance for the whole app, created lazily on first
// connect and torn down on logout — mirrors lib/api.ts's module-level
// singleton pattern (no React dependency here either, so any file can call
// connectSocket()/getSocket() without needing context).
let socket: Socket | null = null

// Connects (or reuses an already-open connection) — called by AuthContext
// once a user is confirmed logged in (after login or a successful silent
// refresh on app boot). `auth` is a FUNCTION, not a plain object, so
// Socket.IO re-invokes it on every (re)connection attempt — meaning a
// dropped connection that reconnects after the access token has since
// rotated still sends the current token, not the one captured at the
// original connect call.
export function connectSocket(): Socket {
  if (socket) return socket

  socket = io({
    path: '/socket.io',
    auth: (cb) => cb({ token: getAccessToken() }),
    // Matches the backend's auth failure being a hard reject (see
    // config/socket.ts's io.use()) — don't hammer retries indefinitely if
    // the token is simply invalid/expired; a fresh connectSocket() call
    // after the next successful login/refresh starts clean instead.
    reconnectionAttempts: 5,
  })

  return socket
}

// Called on logout — closes the connection and drops the reference so a
// subsequent connectSocket() (e.g. a different user logging in on the same
// tab) creates a genuinely new connection rather than reusing a closed one.
export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}

export function getSocket(): Socket | null {
  return socket
}
