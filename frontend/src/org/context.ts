import { useOutletContext } from 'react-router'
import type { GetOrgResponse, Member, MemberRole } from 'shared'

/** 조직 화면(OrgLayout)이 안쪽 탭 페이지들에 넘겨주는 값 */
export interface OrgContextValue {
  org: GetOrgResponse
  members: Member[]
  myRole: MemberRole
  isAdmin: boolean
  /** 조직 정보와 멤버 목록을 다시 불러온다 (멤버가 바뀐 뒤 호출) */
  reload: () => void
}

/**
 * 탭 페이지에서 조직 정보를 꺼낸다.
 * react-router의 <Outlet context={...} />로 넘긴 값을 useOutletContext로 받는다.
 */
export function useOrg(): OrgContextValue {
  return useOutletContext<OrgContextValue>()
}
