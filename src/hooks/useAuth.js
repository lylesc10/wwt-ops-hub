import React, { createContext, useContext } from 'react'

const AuthContext = createContext(null)

// No-auth mode: app is always accessible with full permissions.
// Auth state is always resolved (loading: false) and defaults to admin access.
const DEFAULT_VALUE = {
  session:  null,
  profile:  null,
  user:     null,
  loading:  false,
  isAdmin:  true,
  isPM:     true,
  signIn:   async () => {},
  signOut:  async () => {},
}

export function AuthProvider({ children }) {
  return React.createElement(AuthContext.Provider, { value: DEFAULT_VALUE }, children)
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
