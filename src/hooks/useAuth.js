import React, { createContext, useContext, useEffect, useReducer, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// ── State ─────────────────────────────────────────────────────
const initialState = {
  session: null,
  user: null,      // auth.users row
  profile: null,   // public.users row (includes role)
  loading: true,
  error: null,
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_SESSION':
      return { ...state, session: action.session, user: action.session?.user ?? null, loading: false, error: null }
    case 'SET_PROFILE':
      return { ...state, profile: action.profile }
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

  const fetchProfile = useCallback(async (userId) => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('[AuthContext] fetchProfile error', error)
      return
    }
    dispatch({ type: 'SET_PROFILE', profile: data })
  }, [])

  useEffect(() => {
    // Get initial session once
    supabase.auth.getSession().then(({ data: { session } }) => {
      dispatch({ type: 'SET_SESSION', session })
      if (session?.user) fetchProfile(session.user.id)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Ignore TOKEN_REFRESHED — session is still valid, no profile re-fetch needed
      if (event === 'TOKEN_REFRESHED') return

      if (event === 'SIGNED_OUT') {
        dispatch({ type: 'CLEAR' })
        return
      }

      dispatch({ type: 'SET_SESSION', session })
      if (session?.user) fetchProfile(session.user.id)
    })

    return () => subscription.unsubscribe()
  }, [fetchProfile])

  // ── Auth actions ─────────────────────────────────────────────
  const signIn = useCallback(async ({ email, password }) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) dispatch({ type: 'SET_ERROR', error: error.message })
    return error
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const value = {
    ...state,
    signIn,
    signOut,
    isAdmin: state.profile?.role === 'admin',
    isPM: state.profile?.role === 'pm' || state.profile?.role === 'admin',
  }

  return React.createElement(AuthContext.Provider, { value }, children)
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
