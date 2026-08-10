import rateLimit from 'express-rate-limit'

// Throttles login and password-reset requests per IP to slow down brute-force
// password guessing and credential-stuffing attacks.
// Allows 10 attempts per 15-minute window before returning 429 Too Many Requests.
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: true, // adds RateLimit-* response headers
  legacyHeaders: false, // disables the older X-RateLimit-* headers
  message: { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Too many login attempts, try again later' } },
})

// Throttles calls to the MediAssist AI endpoint per IP, since each query is
// relatively expensive (embedding + vector search + LLM generation) and we
// don't want one user hammering the AI service.
export const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Too many AI queries, slow down' } },
})
