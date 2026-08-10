import rateLimit from 'express-rate-limit'

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Too many login attempts, try again later' } },
})

export const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Too many AI queries, slow down' } },
})
