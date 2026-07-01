/**
 * Client-side JWT session management.
 * Stores tokens in localStorage; fires 'ops-auth-change' events so
 * AuthProvider can react across tabs and within the same tab.
 */

const TOKEN_KEY = 'ops_access_token'
const USER_KEY  = 'ops_user'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)) } catch { return null }
}

export function getSession() {
  const token = getToken()
  const user  = getUser()
  if (!token || !user) return null
  return { access_token: token, user }
}

export function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  window.dispatchEvent(new CustomEvent('ops-auth-change'))
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  window.dispatchEvent(new CustomEvent('ops-auth-change'))
}

/**
 * Sign in via POST /api/auth/login.
 * Returns { error: string|null }
 */
export async function signIn(email, password) {
  try {
    const res  = await fetch('/api/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    })
    const body = await res.json()
    if (!res.ok) return { error: body.message ?? 'Login failed' }
    setSession(body.access_token, body.user)
    return { error: null }
  } catch (e) {
    return { error: e.message ?? 'Network error' }
  }
}

export function signOut() {
  clearSession()
}
