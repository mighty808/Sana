import type { Server as HttpServer } from 'node:http'
import { Server } from 'socket.io'
import jwt from 'jsonwebtoken'
import { env } from './env.js'

let io: Server

export function initSocket(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.clientUrl, credentials: true },
  })

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined
      if (!token) return next(new Error('Unauthorized'))
      const decoded = jwt.verify(token, env.jwtAccessSecret) as { id: string; role: string }
      socket.data.userId = decoded.id
      socket.data.role = decoded.role
      next()
    } catch {
      next(new Error('Unauthorized'))
    }
  })

  io.on('connection', (socket) => {
    socket.join(`user:${socket.data.userId}`)
    socket.join(`role:${socket.data.role}`)
  })

  return io
}

export function getIO(): Server {
  if (!io) throw new Error('Socket.IO not initialized')
  return io
}
