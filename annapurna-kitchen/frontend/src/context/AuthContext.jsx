import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import authService from '../services/authService'
import { registerApiListeners } from '../services/api'

const AuthContext = createContext(null)

export const ROLES = { ADMIN: 'admin', CASHIER: 'cashier' }

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => authService.cachedUser())
  const [shift, setShift] = useState(null)
  const [booting, setBooting] = useState(true)
  const [sessionMessage, setSessionMessage] = useState(null)

  const signOutLocally = useCallback((message) => {
    setUser(null)
    setShift(null)
    if (message) setSessionMessage(message)
  }, [])

  // A 401 anywhere in the app drops the session and bounces to /login.
  useEffect(() => {
    registerApiListeners({
      onSessionExpired: (error) => signOutLocally(error?.message || 'Session ended.'),
    })
  }, [signOutLocally])

  useEffect(() => {
    let cancelled = false
    async function restore() {
      if (!authService.hasToken()) {
        setBooting(false)
        return
      }
      try {
        const data = await authService.me()
        if (!cancelled) {
          setUser(data.user)
          setShift(data.shift)
        }
      } catch {
        if (!cancelled) signOutLocally(null)
      } finally {
        if (!cancelled) setBooting(false)
      }
    }
    restore()
    return () => {
      cancelled = true
    }
  }, [signOutLocally])

  const login = useCallback(async (username, password) => {
    const data = await authService.login(username, password)
    setUser(data.user)
    setShift(data.shift)
    setSessionMessage(null)
    return data.user
  }, [])

  const logout = useCallback(async () => {
    await authService.logout()
    signOutLocally(null)
  }, [signOutLocally])

  const value = useMemo(
    () => ({
      user,
      shift,
      booting,
      sessionMessage,
      clearSessionMessage: () => setSessionMessage(null),
      login,
      logout,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === ROLES.ADMIN,
      isCashier: user?.role === ROLES.CASHIER,
      hasRole: (...roles) => Boolean(user && roles.includes(user.role)),
    }),
    [user, shift, booting, sessionMessage, login, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}

export default AuthContext
