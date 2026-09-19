import { useContext } from 'react'
import { AuthContext } from './AuthContext'

// A small wrapper hook so every screen can just call `useAuth()` instead of
// calling `useContext(AuthContext)` and checking for null by hand every
// time. That null check happens once, here, and throws a clear error if
// this is ever used outside an <AuthProvider> — that would be a real bug in
// the code, not something that should fail silently.
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth() must be used inside <AuthProvider>')
  return ctx
}
