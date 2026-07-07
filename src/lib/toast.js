/**
 * Minimal toast bus. Pages render <Toaster /> (src/components/Toaster.jsx)
 * and anything can call toast.success(...) / toast.error(...).
 */

let listeners = []
let nextId = 1

function emit(type, message) {
  const item = { id: nextId++, type, message }
  for (const fn of listeners) fn(item)
}

export const toast = {
  success: (message) => emit('success', message),
  error: (message) => emit('error', message),
  info: (message) => emit('info', message),
}

export function subscribeToToasts(fn) {
  listeners.push(fn)
  return () => { listeners = listeners.filter((f) => f !== fn) }
}
