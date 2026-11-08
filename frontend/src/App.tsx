import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import AuthProvider from './auth/AuthProvider.tsx'
import RequireAuth, { GuestOnly } from './auth/RequireAuth.tsx'
import Layout from './components/Layout.tsx'
import MembersPage from './org/MembersPage.tsx'
import OrgLayout from './org/OrgLayout.tsx'
import HomePage from './pages/HomePage.tsx'
import LoginPage from './pages/LoginPage.tsx'
import SignupPage from './pages/SignupPage.tsx'

// 화면(페이지)과 URL 경로를 연결하는 곳.
// 라우트를 중첩하면 바깥 라우트(RequireAuth → Layout)가 안쪽 페이지를 감싼다.
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* 로그인 안 한 사람만 */}
          <Route element={<GuestOnly />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
          </Route>

          {/* 로그인한 사람만: 상단 바(Layout) 안에 페이지가 그려진다 */}
          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route path="/" element={<HomePage />} />
              {/* 조직 화면: OrgLayout(조직 이름, 탭) 안에 탭 페이지가 그려진다 */}
              <Route path="/orgs/:orgId" element={<OrgLayout />}>
                <Route index element={<Navigate to="members" replace />} />
                <Route path="members" element={<MembersPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
