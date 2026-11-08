import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './context.ts'

function FullPageLoading() {
  return (
    <div className="grid min-h-dvh place-items-center" role="status" aria-label="불러오는 중">
      <span className="eyebrow">불러오는 중</span>
    </div>
  )
}

/**
 * 로그인해야 볼 수 있는 페이지를 감싸는 "문지기" 라우트.
 * 로그인 안 했으면 /login으로 보내고, 로그인 후 원래 가려던 주소로 돌아올 수 있게 from을 넘긴다.
 */
export default function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <FullPageLoading />
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet /> // Outlet: 이 라우트 아래에 정의된 자식 페이지가 그려지는 자리
}

/** 반대로, 이미 로그인했으면 로그인/가입 화면 대신 홈으로 보낸다. */
export function GuestOnly() {
  const { status } = useAuth()
  if (status === 'loading') return <FullPageLoading />
  if (status === 'authenticated') return <Navigate to="/" replace />
  return <Outlet />
}
