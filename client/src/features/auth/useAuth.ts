import { useContext } from 'react'
import { AuthContext } from './AuthContext'

// Thin hook so every screen imports `useAuth()` instead of reaching into
// `useContext(AuthContext)` + null-checking by hand everywhere — the
// null-check happens once, here, with a clear error if it's ever used
// outside <AuthProvider> (a real bug, not something to silently tolerate).
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth() must be used inside <AuthProvider>')
  return ctx
}
