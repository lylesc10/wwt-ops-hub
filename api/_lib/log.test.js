import { describe, it, expect, vi, afterEach } from 'vitest'
import { log, logInfo, logWarn, logError } from './log.js'

// Regression guard for the pino footgun documented in log.js: a plain
// `log.error('text:', err)` silently drops `err` because pino only merges
// extra args when the message has printf specifiers. These helpers must
// always route the second argument into the record.

describe('logInfo / logWarn / logError', () => {
  afterEach(() => vi.restoreAllMocks())

  it('logs a bare message with no detail argument', () => {
    const spy = vi.spyOn(log, 'info').mockImplementation(() => {})
    logInfo('[scope] something happened')
    expect(spy).toHaveBeenCalledWith('[scope] something happened')
  })

  it('wraps an Error instance under `err` so pino captures the stack', () => {
    const spy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const err = new Error('boom')
    logError('[scope] failed:', err)
    expect(spy).toHaveBeenCalledWith({ err }, '[scope] failed:')
  })

  it('wraps a non-Error detail (string, object, array) under `detail`', () => {
    const spy = vi.spyOn(log, 'warn').mockImplementation(() => {})
    logWarn('[scope] odd response', { status: 500 })
    expect(spy).toHaveBeenCalledWith({ detail: { status: 500 } }, '[scope] odd response')
  })

  it('treats a plain string detail (e.message) the same as any other detail', () => {
    const spy = vi.spyOn(log, 'error').mockImplementation(() => {})
    logError('[scope] parse failed:', 'unexpected token')
    expect(spy).toHaveBeenCalledWith({ detail: 'unexpected token' }, '[scope] parse failed:')
  })
})
