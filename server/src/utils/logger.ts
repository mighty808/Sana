// Produces an ISO-8601 timestamp string for every log line, e.g. "2026-08-10T11:36:26.170Z".
const timestamp = () => new Date().toISOString()

// Minimal structured console logger used everywhere instead of raw console.log,
// so every log line consistently has a timestamp and severity label.
// Can be swapped for a real logging library (pino/winston) later without
// touching every call site — they'd all still just call logger.info/warn/error.
export const logger = {
  info: (...args: unknown[]) => console.log(`[${timestamp()}] INFO`, ...args),
  warn: (...args: unknown[]) => console.warn(`[${timestamp()}] WARN`, ...args),
  error: (...args: unknown[]) => console.error(`[${timestamp()}] ERROR`, ...args),
}
