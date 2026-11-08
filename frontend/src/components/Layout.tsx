import { Link, NavLink, Outlet } from 'react-router'
import { useAuth } from '../auth/context.ts'

/** 로그인 후 모든 화면에 공통으로 붙는 상단 바. 페이지 내용은 <Outlet />에 그려진다. */
export default function Layout() {
  const { user, logout } = useAuth()
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">When to Meet</Link>
          <nav className="row">
            <NavLink to="/" end>내 조직</NavLink>
          </nav>
          <span className="spacer" />
          <span className="muted">{user?.name}</span>
          <button type="button" className="secondary" onClick={() => void logout()}>로그아웃</button>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </>
  )
}
