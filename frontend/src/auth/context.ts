import { createContext, useContext } from 'react'
import type { CreateSessionRequest, User } from 'shared'

export interface AuthState {
  /** 'loading': 새로고침 직후 세션 확인 중. 이때는 로그인 여부를 아직 모른다. */
  status: 'loading' | 'authenticated' | 'anonymous'
  user: User | null
  /** 세션이 만료되어(보호된 요청이 401) 로그아웃된 경우 true. 로그인 화면에서 안내한다. */
  sessionExpired: boolean
  login: (input: CreateSessionRequest) => Promise<void>
  logout: () => Promise<void>
}

// Context는 "앱 전체에서 꺼내 쓰는 전역 값"이다. 값은 AuthProvider가 넣어 준다.
export const AuthContext = createContext<AuthState | null>(null)

/** 컴포넌트 안에서 로그인 상태를 꺼낸다. 예: const { user, logout } = useAuth() */
export function useAuth(): AuthState {
  const value = useContext(AuthContext)
  if (value === null) throw new Error('useAuth는 <AuthProvider> 안에서만 쓸 수 있다')
  return value
}
