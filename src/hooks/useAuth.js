import React, { createContext, useContext, useEffect, useReducer, useCallback } from 'react'
import { getSession, signIn as authSignIn, signOut as authSignOut } from '@/lib/auth'

const initialState = { session: null, profile: null, loading: true }

function reducer(state, action) {
  switch (action.type) {
    case 'LOADED': return { session: action.session, profile: action.profile, loading: false }
    case 'CLEAR':  return { ...initialState, loading: false }
    default:       return state
  }
}

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  const loadSession = useCallback(async () => {
    const session = getSession()
    if (!session) { dispatch({ type: 'CLEAR' }); return }

    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) { authSignOut(); dispatch({ type: 'CLEAR' }); return }
      const profile = await res.json()
      dispatch({ type: 'LOADED', session, profile })
    } catch {
      authSignOut()
      dispatch({ type: 'CLEAR' })
    }
  }, [])

  useEffect(() => {
    loadSession()
    const handler = () => loadSession()
    window.addEventListener('ops-auth-change', handler)
    return () => window.removeEventListener('ops-auth-change', handler)
  }, [loadSession])

  const signIn = useCallback(async (email, password) => {
    const { error } = await authSignIn(email, password)
    if (error) throw new Error(error)
    await loadSession()
  }, [loadSession])

  const signOut = useCallback(async () => {
    authSignOut()
    dispatch({ type: 'CLEAR' })
  }, [])

  const value = {
    ...state,
    user:    state.session?.user ?? null,
    signIn,
    signOut,
    isAdmin: state.profile?.role === 'admin',
    isPM:    state.profile?.role === 'pm' || state.profile?.role === 'admin',
  }

  return React.createElement(AuthContext.Provider, { value }, children)
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
