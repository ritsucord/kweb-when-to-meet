import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { MenuIcon } from 'lucide-react'
import { AppDataProvider, useAppData } from '@/app/AppData'
import { useAuth } from '@/auth/context'
import { Logo } from '@/components/Logo'
import { ThemeToggle } from '@/components/theme'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

/**
 * 로그인 후 공통 틀(App Shell).
 *
 *  ┌──────────┬──────────────────────┐   lg(1024px) 이상: 왼쪽 사이드바 고정
 *  │ 사이드바 │  페이지 (<Outlet />) │
 *  └──────────┴──────────────────────┘
 *
 *  ┌─────────────────────────────────┐   lg 미만(태블릿·휴대폰): 상단 바 +
 *  │ ☰ KUrdination            ☾     │   ☰를 누르면 같은 사이드바가 왼쪽에서 밀려 나온다(Sheet)
 *  ├─────────────────────────────────┤
 *  │ 페이지                          │
 *  └─────────────────────────────────┘
 */
export default function Layout() {
  return (
    <AppDataProvider>
      <Shell />
    </AppDataProvider>
  )
}

function Shell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  // 메뉴 안의 링크를 눌러 주소가 바뀌면 시트를 닫는다.
  // (렌더 중에 이전 값과 비교해서 상태를 맞추는 패턴: useEffect보다 한 번 덜 그린다)
  const [lastPath, setLastPath] = useState(location.pathname)
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname)
    setMenuOpen(false)
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      {/* 데스크톱 사이드바: 오른쪽 1px 선으로만 구획 */}
      <aside className="sticky top-0 hidden h-dvh border-r border-line lg:block">
        <SidebarContent />
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* 태블릿·휴대폰 상단 바 */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-ink bg-paper px-2 md:px-6 lg:hidden">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="hover:no-underline" aria-label="메뉴 열기"><MenuIcon className="size-5" /></Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[85vw] max-w-[280px] gap-0 bg-paper p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>메뉴</SheetTitle>
                <SheetDescription>KUrdination 탐색 메뉴</SheetDescription>
              </SheetHeader>
              <SidebarContent />
            </SheetContent>
          </Sheet>
          <Link to="/" className="outline-none focus-visible:underline"><Logo /></Link>
          <span className="flex-1" />
          <ThemeToggle />
        </header>

        <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 pt-6 pb-12 md:px-8 md:pt-8 xl:px-12 xl:pt-12">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

/** 사이드바 내용. 데스크톱 고정 사이드바와 모바일 시트가 같은 컴포넌트를 쓴다. */
function SidebarContent() {
  const { user, logout } = useAuth()
  const { orgs, inviteCount } = useAppData()

  return (
    <div className="flex h-full flex-col px-4 py-6">
      <Link to="/" className="mb-8 px-2 outline-none focus-visible:underline"><Logo className="text-2xl" /></Link>

      <nav className="flex min-w-0 flex-1 flex-col gap-8 overflow-x-hidden overflow-y-auto" aria-label="주 메뉴">
        <ul className="grid grid-cols-[minmax(0,1fr)]">
          <li><SideLink to="/" end>내 조직</SideLink></li>
          <li><SideLink to="/invites" count={inviteCount}>받은 초대</SideLink></li>
        </ul>

        <div>
          <p className="eyebrow mx-2 mb-2 border-b border-line pb-2">조직</p>
          {orgs.length === 0 && <p className="px-2 py-2 text-sm text-ink-soft">없음</p>}
          <ul className="grid grid-cols-[minmax(0,1fr)]">
            {orgs.map((org) => (
              <li key={org.id}>
                <SideLink to={`/orgs/${encodeURIComponent(org.id)}`}>{org.name}</SideLink>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div className="mx-2 mt-6 border-t border-ink pt-4">
        <p className="truncate font-semibold">{user?.name}</p>
        <p className="num truncate text-xs text-ink-soft">{user?.email}</p>
        <div className="mt-3 flex gap-4">
          <ThemeToggle withLabel />
          <Button variant="ghost" className="h-8 px-0 font-medium" onClick={() => void logout()}>로그아웃</Button>
        </div>
      </div>
    </div>
  )
}

/** 사이드바 항목: 글자만. 현재 위치는 반전(.selected)으로 표시한다. */
function SideLink({ to, end, count, children }: { to: string; end?: boolean; count?: number; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => cn(
        'flex h-9 items-center gap-2 px-2 text-[0.95rem] outline-none',
        'hover:underline hover:underline-offset-4 focus-visible:underline',
        isActive && 'selected font-semibold hover:no-underline',
      )}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {/* 받은 초대 수: 포인트 빨강 숫자 (선택 중에는 반전 글자색) */}
      {count ? <span className="num text-sm font-semibold text-accent-ink in-[.selected]:text-paper">{count}</span> : null}
    </NavLink>
  )
}
