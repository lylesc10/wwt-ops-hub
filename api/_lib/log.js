/**
 * Structured logging for api/** handlers and server.js.
 *
 * Emits JSON logs (one object per line) so they can be parsed by whatever
 * log sink Container Apps forwards to (Log Analytics, etc.) instead of the
 * unstructured `console.*` text this replaces.
 *
 * IMPORTANT: pino only merges an extra argument into the log record when the
 * message string contains a printf-style specifier (%s, %d, %o, ...) — unlike
 * console.error, a plain `log.error('thing failed:', err)` silently DROPS the
 * `err` argument. The logInfo/logWarn/logError helpers below exist so that
 * the common `console.error('[scope] message:', errOrDetail)` call pattern
 * carries its second argument over correctly: Error instances are captured
 * under `err` (pino auto-serializes the stack), anything else under `detail`.
 */

import pino from 'pino'

export const log = pino({
  level: process.env.LOG_LEVEL || 'info',
})

function withDetail(level, message, detail) {
  if (detail === undefined) {
    log[level](message)
  } else if (detail instanceof Error) {
    log[level]({ err: detail }, message)
  } else {
    log[level]({ detail }, message)
  }
}

export function logInfo(message, detail) { withDetail('info', message, detail) }
export function logWarn(message, detail) { withDetail('warn', message, detail) }
export function logError(message, detail) { withDetail('error', message, detail) }
