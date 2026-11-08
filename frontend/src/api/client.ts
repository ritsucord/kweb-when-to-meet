import { createORPCClient } from '@orpc/client'
import type { ContractRouterClient } from '@orpc/contract'
import type { JsonifiedClient } from '@orpc/openapi-client'
import { OpenAPILink } from '@orpc/openapi-client/fetch'
import { contract } from 'shared'

// 401을 받았을 때 실행할 함수. 인증 상태를 가진 AuthProvider가 등록한다.
// (client.ts는 React 바깥의 모듈이라 직접 navigate할 수 없어서, 콜백을 받아 둔다)
let onUnauthorized: (() => void) | null = null

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler
}

const link = new OpenAPILink(contract, {
  url: `${location.origin}/api`,
  fetch: async (input, init) => {
    const response = await fetch(input, { ...init, credentials: 'include' })
    // 로그인/현재 세션 확인 요청의 401은 "로그인 안 됨"이라는 정상적인 답이므로 제외한다.
    const path = new URL(response.url).pathname
    const isAuthProbe = path === '/api/sessions' || path === '/api/sessions/current'
    if (response.status === 401 && !isAuthProbe) onUnauthorized?.()
    return response
  },
})

// contract(서버와 공유하는 API 계약)에서 타입이 추론되는 클라이언트.
// 예: await api.listMyOrgs()  → { orgs: OrgSummary[] }
//     await api.getOrg({ params: { orgId } })
// JsonifiedClient: 응답은 JSON을 거쳐 오므로 Date 같은 값도 문자열 타입으로 맞춘다.
export const api: JsonifiedClient<ContractRouterClient<typeof contract>> = createORPCClient(link)
