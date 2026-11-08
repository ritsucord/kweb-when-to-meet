import { ORPCError } from '@orpc/client'

// 서버 오류 본문은 { code: 403, msg: "..." } 형태라 oRPC 기본 형식과 다르다.
// 그래서 oRPC 클라이언트는 ORPCError를 던지되, HTTP 상태를 error.status에 넣어 준다.
// 화면에서는 이 status만 보고 문구를 정한다. (msg는 개발자용 영어라 사용자에게 보여주지 않는다)

/** 오류에서 HTTP 상태 코드를 꺼낸다. 네트워크 오류 등 HTTP 응답이 아니면 null. */
export function errorStatus(error: unknown): number | null {
  if (error instanceof ORPCError && typeof error.status === 'number') return error.status
  return null
}

const defaultMessages: Record<number, string> = {
  400: '입력값을 다시 확인해 주세요.',
  401: '로그인이 필요합니다.',
  403: '권한이 없습니다.',
  404: '찾을 수 없습니다.',
  409: '이미 처리되었거나 충돌이 발생했습니다.',
}

/**
 * 오류를 사용자에게 보여줄 한국어 문구로 바꾼다.
 * overrides로 화면마다 상태별 문구를 바꿀 수 있다. 예: { 409: '이미 가입된 이메일입니다.' }
 */
export function errorMessage(error: unknown, overrides: Record<number, string> = {}): string {
  const status = errorStatus(error)
  if (status === null) return '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.'
  return overrides[status] ?? defaultMessages[status] ?? `알 수 없는 오류가 발생했습니다. (${status})`
}
