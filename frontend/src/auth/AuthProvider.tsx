import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { CreateSessionRequest, User } from 'shared'
import { api, setUnauthorizedHandler } from '../api/client.ts'
import { errorStatus } from '../api/errors.ts'
import { AuthContext, type AuthState } from './context.ts'

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('loading')
  const [user, setUser] = useState<User | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)

  // 세션은 HttpOnly 쿠키라 JS에서 읽을 수 없다. 그래서 "지금 로그인돼 있나?"는 서버에 묻는다.
  const refresh = useCallback(async () => {
    try {
      const current = await api.getCurrentSession()
      setUser(current.user)
      setStatus('authenticated')
    } catch (e) {
      // 401이면 로그아웃 상태. 그 밖의 오류(서버 다운 등)도 일단 로그아웃으로 보고 로그인 화면을 띄운다.
      if (errorStatus(e) !== 401) console.error(e)
      setUser(null)
      setStatus('anonymous')
    }
  }, [])

  // 1) 앱이 처음 뜰 때(새로고침 포함) 로그인 상태를 복원한다.
  useEffect(() => {
    void refresh()
  }, [refresh])

  // 2) 어떤 보호된 요청이든 401이 오면 세션이 끝난 것이므로 로그아웃 상태로 바꾼다.
  //    그러면 <RequireAuth>가 로그인 화면으로 보낸다.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null)
      setStatus('anonymous')
      setSessionExpired(true)
    })
    return () => setUnauthorizedHandler(null)
  }, [])

  const login = useCallback(async (input: CreateSessionRequest) => {
    await api.createSession({ body: input }) // 성공하면 서버가 session 쿠키를 심는다
    setSessionExpired(false)
    await refresh() // 로그인 응답에는 유저 정보가 없으므로 다시 조회한다
  }, [refresh])

  const logout = useCallback(async () => {
    try {
      await api.deleteSessionCurrent()
    } finally {
      // 서버 요청이 실패해도(이미 만료 등) 화면에서는 로그아웃 처리한다.
      setUser(null)
      setStatus('anonymous')
    }
  }, [])

  // useMemo: 값이 실제로 바뀔 때만 새 객체를 만들어, useAuth를 쓰는 컴포넌트가 불필요하게 다시 그려지지 않게 한다.
  const value = useMemo<AuthState>(
    () => ({ status, user, sessionExpired, login, logout }),
    [status, user, sessionExpired, login, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
