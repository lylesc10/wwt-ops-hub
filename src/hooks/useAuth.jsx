import React, { createContext, useContext, useEffect, useReducer, useCallback, useRef } from 'react'
import { dab, getToken, setToken, setRefreshToken, clearToken, clearRefreshToken, getRefreshToken } from '@/lib/dab'

// ── State ─────────────────────────────────────────────────────
const initialState = {
  session: null,
  user: null,      // { id, email, full_name, role, avatar_url, ... }
  profile: null,   // alias for user — kept for backward compat
  loading: true,
  error: null,
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_USER':
      return {
        ...state,
        session: action.session,
        user:    action.user,
        profile: action.user,  // profile === user now (single source)
        loading: false,
        error:   null,
      }
    case 'SET_ERROR':
      return { ...state, error: action.error, loading: false }
    case 'CLEAR':
      return { ...initialState, loading: false }
    default:
      return state
  }
}

// ── Context ───────────────────────────────────────────────────
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const refreshTimerRef   = useRef(null)

  // ── Restore session on mount ────────────────────────────────
  useEffect(() => {
    const token = getToken()
    if (!token) {
      dispatch({ type: 'CLEAR' })
      return
    }

    // Validate existing token by fetching /api/auth/me
    dab.auth.getUser().then(({ data }) => {
      if (data?.user) {
        dispatch({
          type:    'SET_USER',
          session: { access_token: token },
          user:    data.user,
        })
        scheduleRefresh()
      } else {
        // Token is invalid/expired — try refresh
        silentRefresh()
      }
    })

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Silent token refresh ~5 min before expiry ───────────────
  function scheduleRefresh(expiresIn = 3600) {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    const delay = Math.max((expiresIn - 300) * 1000, 30_000) // refresh 5 min early
    refreshTimerRef.current = setTimeout(silentRefresh, delay)
  }

  async function silentRefresh() {
    const { data, error } = await dab.auth.refreshSession()
    if (error || !data) {
      dispatch({ type: 'CLEAR' })
      return
    }
    // Re-fetch profile after refresh
    const { data: meData } = await dab.auth.getUser()
    if (meData?.user) {
      dispatch({
        type:    'SET_USER',
        session: data.session,
        user:    meData.user,
      })
      scheduleRefresh()
    } else {
      dispatch({ type: 'CLEAR' })
    }
  }

  // ── Auth actions ─────────────────────────────────────────────
  const signIn = useCallback(async ({ email, password }) => {
    const { data, error } = await dab.auth.signInWithPassword({ email, password })
    if (error) {
      dispatch({ type: 'SET_ERROR', error: error.message })
      return error
    }
    dispatch({
      type:    'SET_USER',
      session: data.session,
      user:    data.user,
    })
    scheduleRefresh()
    return null
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const signOut = useCallback(async () => {
    await dab.auth.signOut()
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    dispatch({ type: 'CLEAR' })
  }, [])

  // ── Derived helpers (backward-compat) ────────────────────────
  const value = {
    ...state,
    signIn,
    signOut,
    // These are read by every hook that does:
    //   const { data: { session } } = await supabase.auth.getSession()
    //   fetch('/api/...', { headers: { Authorization: `Bearer ${session?.access_token}` } })
    // Replace that pattern with: const token = getToken()
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
