import type { z } from 'zod'

/**
 * zod 검증 결과를 { 필드이름: 첫 번째 오류 문구 } 형태로 바꾼다.
 * 서버는 400일 때 어느 필드가 틀렸는지 알려주지 않으므로(가이드 3장),
 * 보내기 전에 shared의 스키마로 먼저 검증해서 필드별 오류를 보여준다.
 */
export function fieldErrors(error: z.ZodError, messages: Record<string, string> = {}): Record<string, string> {
  const result: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '')
    if (!(key in result)) result[key] = messages[key] ?? '올바른 값을 입력해 주세요.'
  }
  return result
}
