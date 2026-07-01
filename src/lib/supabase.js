/**
 * Compatibility shim — replaces the Supabase client.
 *
 * All existing `import { supabase } from '@/lib/supabase'` call sites work
 * unchanged:
 *   supabase.from('table').select(...)   → routes to DAB REST via dab.js
 *   supabase.auth.*                      → routes to JWT auth via auth.js
 *   supabase.channel().on().subscribe()  → converts realtime to 30-second polling
 *   supabase.removeChannel(channel)      → clears the polling interval
 */

import { dab } from './dab.js'
import {
  getSession, signIn as authSignIn, signOut as authSignOut,
} from './auth.js'

// ── Realtime stub → polling ───────────────────────────────────────────────────
// Replaces supabase.channel(...).on('postgres_changes', {}, callback).subscribe()
// with a 30-second polling interval. supabase.removeChannel(ch) clears it.

function makeChannel() {
  let _callback = null
  let _interval = null

  const ch = {
    on(_event, _filter, callback) {
      _callback = callback
      return ch
    },
    subscribe() {
      if (_callback) _interval = setInterval(_callback, 30_000)
      return ch
    },
    _cleanup() {
      if (_interval) { clearInterval(_interval); _interval = null }
    },
  }
  return ch
}

// ── Auth shim ─────────────────────────────────────────────────────────────────

const authShim = {
  getSession: () => Promise.resolve({ data: { session: getSession() } }),

  signInWithPassword: async ({ email, password }) => {
    const { error } = await authSignIn(email, password)
    return { error: error ? { message: error } : null }
  },

  signOut: async () => {
    authSignOut()
    return { error: null }
  },

  onAuthStateChange: (callback) => {
    const handler = () => {
      const session = getSession()
      callback(session ? 'SIGNED_IN' : 'SIGNED_OUT', session)
    }
    window.addEventListener('ops-auth-change', handler)
    return {
      data: { subscription: { unsubscribe: () => window.removeEventListener('ops-auth-change', handler) } },
    }
  },

  // Admin methods — not available in new stack
  admin: {
    inviteUserByEmail: async () => ({
      data: null,
      error: { message: 'User creation: use Settings → Users to add users via the new API.' },
    }),
  },
}

// ── Exported shim ─────────────────────────────────────────────────────────────

export const supabase = {
  from:          (table) => dab.from(table),
  channel:       (_name) => makeChannel(),
  removeChannel: (ch)    => ch?._cleanup?.(),
  auth:          authShim,
}
