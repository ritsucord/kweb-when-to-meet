import { useCallback } from 'react'
import { Link, NavLink, Outlet, useParams } from 'react-router'
import { api } from '../api/client.ts'
import { errorMessage } from '../api/errors.ts'
import { useAuth } from '../auth/context.ts'
import RoleBadge from '../components/RoleBadge.tsx'
import { formatDate } from '../lib/time.ts'
import { useApi } from '../lib/useApi.ts'
import type { OrgContextValue } from './context.ts'

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

  if (loading && !data) return <p className="muted">불러오는 중…</p>
  if (error != null || !data) {
    return (
      <div className="stack">
        <div className="alert error">
          {errorMessage(error, { 403: '이 조직의 멤버가 아닙니다.', 404: '존재하지 않는 조직입니다.' })}
        </div>
        <Link to="/">← 내 조직으로</Link>
      </div>
    )
  }

  const [org, { members }] = data
  const myRole = members.find((m) => m.id === user?.id)?.role ?? 'member'
  const context: OrgContextValue = { org, members, myRole, isAdmin: myRole === 'admin', reload }

  return (
    <div className="stack">
      <div className="org-header">
        <Link to="/" className="muted">← 내 조직</Link>
        <div className="row">
          <h1>{org.name}</h1>
          <RoleBadge role={myRole} />
        </div>
        {org.description && <p>{org.description}</p>}
        <p className="muted">멤버 {org.memberCount}명 · {formatDate(org.createdAt)} 생성</p>
      </div>

      <nav className="tabs">
        <NavLink to="members">멤버</NavLink>
      </nav>

      <Outlet context={context} />
    </div>
  )
}
