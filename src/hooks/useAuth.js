import React, { createContext, useContext } from 'react'

const BYPASS_USER = {
  id:       'dev-bypass',
  email:    'dev@local',
  role:     'admin',
  full_name: 'Dev Bypass',
}

const BYPASS_VALUE = {
  session:  { user: BYPASS_USER },
  user:     BYPASS_USER,
  profile:  BYPASS_USER,
  loading:  false,
  error:    null,
  isAdmin:  true,
  isPM:     true,
  signIn:   async () => null,
  signOut:  async () => {},
}

// ── Context ───────────────────────────────────────────────────
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  return React.createElement(AuthContext.Provider, { value: BYPASS_VALUE }, children)
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
