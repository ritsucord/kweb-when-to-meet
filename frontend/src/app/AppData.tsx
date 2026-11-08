import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import type { OrgSummary } from 'shared'
import { api } from '@/api/client'
import { useApi } from '@/lib/useApi'

interface AppData {
  /** 내가 속한 조직 (사이드바, 홈 화면) */
  orgs: OrgSummary[]
  orgsLoading: boolean
  orgsError: unknown
  /** 받은 초대 개수 (사이드바 배지, 홈 배너) */
  inviteCount: number
  /** 조직 생성·탈퇴·초대 수락 등으로 목록이 바뀐 뒤 호출 */
  refresh: () => void
}

const AppDataContext = createContext<AppData | null>(null)

/**
 * 여러 화면이 함께 쓰는 "내 조직 목록"과 "받은 초대 수"를 한 곳에서 불러온다.
 * 사이드바와 홈 화면이 같은 데이터를 보므로, 한쪽에서 바꾸면 refresh() 한 번으로 둘 다 갱신된다.
 */
export function AppDataProvider({ children }: { children: ReactNode }) {
  const loadOrgs = useCallback(() => api.listMyOrgs(), [])
  const loadInvites = useCallback(() => api.listMyInvites({ query: {} }), [])
  const orgs = useApi(loadOrgs)
  const invites = useApi(loadInvites)
  const { reload: reloadOrgs } = orgs
  const { reload: reloadInvites } = invites

  const refresh = useCallback(() => {
    reloadOrgs()
    reloadInvites()
  }, [reloadOrgs, reloadInvites])

  const value = useMemo<AppData>(() => ({
    orgs: [...(orgs.data?.orgs ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    orgsLoading: orgs.loading && !orgs.data,
    orgsError: orgs.error,
    inviteCount: invites.data?.invites.length ?? 0,
    refresh,
  }), [orgs.data, orgs.loading, orgs.error, invites.data, refresh])

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppData(): AppData {
  const value = useContext(AppDataContext)
  if (!value) throw new Error('useAppData는 <AppDataProvider> 안에서만 쓸 수 있다')
  return value
}
