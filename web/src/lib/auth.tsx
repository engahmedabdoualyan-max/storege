import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, getStoredUser, getToken, setStoredUser, setToken } from './api'

export type Role = 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'VIEWER'
export type User = {
  id: string
  name: string
  email: string
  role: Role
  phone?: string | null
}

type AuthContextValue = {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<User>
  logout: () => void
  can: (...roles: Role[]) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => getStoredUser<User>())
  const [loading, setLoading] = useState(Boolean(getToken()))
  const queryClient = useQueryClient()

  useEffect(() => {
    let active = true
    if (!getToken()) {
      setLoading(false)
      return
    }
    api
      .get<User>('/api/auth/me')
      .then((fresh) => {
        if (!active) return
        setUser(fresh)
        setStoredUser(fresh)
      })
      .catch(() => {
        if (!active) return
        setToken(null)
        setStoredUser(null)
        setUser(null)
      })
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const onUnauthorized = () => {
      setToken(null)
      setStoredUser(null)
      setUser(null)
      queryClient.clear()
    }
    window.addEventListener('storege:unauthorized', onUnauthorized)
    return () => window.removeEventListener('storege:unauthorized', onUnauthorized)
  }, [queryClient])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login: async (email, password) => {
        const result = await api.post<{ token: string; user: User }>('/api/auth/login', {
          email,
          password,
        })
        setToken(result.token)
        setStoredUser(result.user)
        setUser(result.user)
        // Drop any anonymous/forbidden results cached before authentication.
        queryClient.clear()
        return result.user
      },
      logout: () => {
        setToken(null)
        setStoredUser(null)
        setUser(null)
        queryClient.clear()
      },
      can: (...roles) => {
        if (!user) return false
        if (user.role === 'ADMIN') return true
        return roles.includes(user.role)
      },
    }),
    [user, loading, queryClient],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'مدير النظام',
  MANAGER: 'مدير مخزن',
  OPERATOR: 'موظف مخزن',
  VIEWER: 'مشاهد',
}
