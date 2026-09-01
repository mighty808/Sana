// Loads variables from server/.env into process.env before anything else runs.
import 'dotenv/config'

// Reads an environment variable, falling back to a default value if provided.
// Throws at startup if the variable is missing and has no fallback — this way
// misconfiguration fails fast instead of causing confusing runtime errors later.
function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

// Centralized, typed access to all environment configuration.
// Every other file should import `env` from here instead of reading
// `process.env` directly, so all config lives in one place.
export const env = {
  // 'development' | 'production' | 'test' — controls things like cookie 'secure' flag.
  nodeEnv: process.env.NODE_ENV ?? 'development',
  // Port the Express HTTP server listens on.
  port: Number(process.env.PORT ?? 3000),
  // Frontend origin — used for CORS and Socket.IO CORS config.
  clientUrl: required('CLIENT_URL', 'http://localhost:5173'),
  // MongoDB connection string (local mongod or Atlas).
  mongoUri: required('MONGO_URI', 'mongodb://localhost:27017/sana'),
  // Secret used to sign/verify short-lived JWT access tokens.
  jwtAccessSecret: required('JWT_ACCESS_SECRET', 'dev-access-secret-change-me'),
  // Secret used to sign/verify long-lived JWT refresh tokens (stored in an HTTP-only cookie).
  jwtRefreshSecret: required('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me'),
  // How long an access token stays valid before the client must refresh it.
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  // How long a refresh token (and its cookie) stays valid.
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  // Base URL of the separate FastAPI microservice that runs Sana AI.
  aiServiceUrl: process.env.AI_SERVICE_URL ?? 'http://localhost:8000',
}
