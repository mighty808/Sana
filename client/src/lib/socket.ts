import { io, type Socket } from 'socket.io-client'
import { getAccessToken } from './api'

// One shared socket connection for the whole app. It's created the first
// time something connects, and closed again on logout. This follows the
// same pattern as lib/api.ts: no React dependency here either, so any file
// can call connectSocket() or getSocket() without needing a React context.
let socket: Socket | null = null

// Connects, or reuses an already-open connection if there is one. This is
// called by AuthContext once a user is confirmed logged in, either after a
// normal login or after a successful silent token refresh when the app
// first loads. `auth` is set to a function rather than a plain object, so
// Socket.IO calls it again every time it tries to (re)connect. That means
// if the connection drops and reconnects after the access token has since
// changed, it sends the current token rather than the older one that was
// captured back when the connection was first made.
export function connectSocket(): Socket {
  if (socket) return socket

  // Same reasoning as lib/api.ts's VITE_API_URL: with no URL, socket.io-client
  // connects to whatever origin served the page, which only works when the
  // client and server share an origin. VITE_SOCKET_URL points it at the
  // server's own origin instead for a split deployment (e.g. Vercel + Render)
  // — set it to the server's origin with no path, e.g.
  // https://sana-server.onrender.com. Left unset, this is undefined and
  // socket.io-client falls back to same-origin exactly as before.
  socket = io(import.meta.env.VITE_SOCKET_URL || undefined, {
    path: '/socket.io',
    auth: (cb) => cb({ token: getAccessToken() }),
    // Left at socket.io's default of retrying indefinitely (with its own
    // exponential backoff). This used to be capped at 5 attempts, reasoning
    // that a rejected auth check can never succeed by retrying — true, but
    // that cap applied to *every* failure, including an ordinary dropped
    // connection. A ~20 second wifi drop (a laptop sleeping, a lift, a VPN
    // hiccup) burned all 5 attempts, after which the socket was dead for
    // the rest of the session: the notification bell silently stopped
    // updating with no visible sign anything was wrong, and only a manual
    // page reload brought it back. The two failure modes are separated by
    // the connect_error handler below instead.
  })

  // An auth rejection is permanent — retrying can't fix an invalid or
  // expired token, so give up immediately and let the next successful
  // login/refresh call connectSocket() again for a clean connection. The
  // server sends exactly this message for every auth failure (see
  // server/src/config/socket.ts's io.use()). Any other connect error is
  // transient, so it's left alone to keep reconnecting.
  socket.on('connect_error', (err) => {
    if (err.message === 'Unauthorized') socket?.disconnect()
  })

  return socket
}

// Called on logout. This closes the connection and clears the stored
// reference, so that a later call to connectSocket() — for example, if a
// different user logs in on the same browser tab — creates a real new
// connection instead of trying to reuse a closed one.
export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}

export function getSocket(): Socket | null {
  return socket
}
