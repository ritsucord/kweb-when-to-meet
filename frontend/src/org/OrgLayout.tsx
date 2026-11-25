import { useCallback } from 'react'
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router'
import { api } from '@/api/client'
import { errorMessage } from '@/api/errors'
import { useAuth } from '@/auth/context'
import { PageHeader } from '@/components/PageHeader'
import RoleBadge from '@/components/RoleBadge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useApi } from '@/lib/useApi'
import { cn } from '@/lib/utils'
import type { OrgContextValue } from './context'

/**
 * /orgs/:orgId 아래 모든 탭(일정, 멤버, 초대)이 공유하는 틀.
 * 조직 정보와 멤버 목록을 한 번 불러와서 탭들에 넘겨준다.
 */
export default function OrgLayout() {
  const { orgId = '' } = useParams() // URL의 :orgId 부분
  const { user } = useAuth()

  // 두 요청은 서로 기다릴 필요가 없으므로 Promise.all로 동시에 보낸다.
  const load = useCallback(
    () => Promise.all([api.getOrg({ params: { orgId } }), api.listMembers({ params: { orgId } })]),
    [orgId],
  )
  const { data, error, loading, reload } = useApi(load)

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-[480px]" />
      </div>
    )
  }
  if (error != null || !data) {
    return (
      <div className="max-w-lg space-y-6 py-10">
        <Alert variant="destructive">
          <AlertTitle>조직을 열 수 없습니다</AlertTitle>
          <AlertDescription>{errorMessage(error, { 403: '이 조직의 멤버가 아닙니다.', 404: '존재하지 않는 조직입니다.' })}</AlertDescription>
        </Alert>
        <Button asChild variant="outline"><Link to="/">← 내 조직</Link></Button>
      </div>
    )
  }

  const [org, { members }] = data
  const myRole = members.find((m) => m.id === user?.id)?.role ?? 'member'
  const context: OrgContextValue = { org, members, myRole, isAdmin: myRole === 'admin', reload }

  return (
    <div className="space-y-8">
      <div>
        <PageHeader
          kicker={<Link to="/" className="text-sm font-medium hover:underline hover:underline-offset-4">← 내 조직</Link>}
          title={<>{org.name} <RoleBadge role={myRole} /></>}
          lead={org.description || undefined}
          className="border-b-0 pb-6"
        />

        {/* 탭: 글자만. 현재 탭은 반전(.selected). 좁은 화면에서는 가로로 넘긴다 */}
        <nav
          className="-mx-4 flex overflow-x-auto overflow-y-hidden border-y-2 border-ink px-4 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
          aria-label="조직 메뉴"
        >
          <OrgTab to="events">일정</OrgTab>
          <OrgTab to="availability">가능 시간</OrgTab>
          <OrgTab to="members">멤버 <span className="num">{members.length}</span></OrgTab>
          {/* 초대 관리는 관리자에게만 보인다 */}
          {myRole === 'admin' && <OrgTab to="invites">초대</OrgTab>}
        </nav>
      </div>

      <Outlet context={context} />
    </div>
  )
}

function OrgTab({ to, children }: { to: string; children: React.ReactNode }) {
  // 조직 ID의 콜론(o:…)이 주소에서 %3A로 인코딩되면 NavLink의 isActive가 맞지 않는다.
  // 그래서 디코딩한 현재 주소의 마지막 부분(events/members/invites)과 직접 비교한다.
  const { pathname } = useLocation()
  const current = decodeURIComponent(pathname).split('/').filter(Boolean)[2]
  return (
    <NavLink
      to={to}
      aria-current={current === to ? 'page' : undefined}
      className={({ isActive: routerActive }) => cn(
        'inline-flex h-11 shrink-0 items-center gap-1.5 border-r border-line px-5 text-[0.95rem] whitespace-nowrap outline-none first:border-l-0',
        'hover:underline hover:underline-offset-4 focus-visible:underline',
        (routerActive || current === to) && 'selected border-ink font-semibold hover:no-underline',
      )}
    >
      {children}
    </NavLink>
  )
}
