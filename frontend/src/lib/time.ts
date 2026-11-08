// 서버와 주고받는 시각은 항상 UTC ISO 문자열이다. (예: 2026-11-10T03:00:00.000Z)
// +09:00 같은 오프셋은 서버가 400으로 거절하므로, 보낼 때는 반드시 toISOString()을 쓴다.

/** Date → 서버에 보낼 UTC 문자열. toISOString()은 항상 Z로 끝난다. */
export function toServerTime(date: Date): string {
  return date.toISOString()
}

/** <input type="datetime-local">의 값("2026-11-10T12:00", 로컬 시각) → Date */
export function fromLocalInput(value: string): Date {
  // 오프셋 없이 "YYYY-MM-DDTHH:mm"을 new Date에 넘기면 로컬 시각으로 해석된다.
  return new Date(value)
}

/** Date → <input type="datetime-local">에 넣을 값 (로컬 시각) */
export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const dateTimeFormat = new Intl.DateTimeFormat('ko-KR', {
  month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit',
})
const timeFormat = new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' })
const dateFormat = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })

/** 서버 시각 문자열 → 화면 표시용 (브라우저 로컬 시간대) */
export const formatDateTime = (iso: string) => dateTimeFormat.format(new Date(iso))
export const formatTime = (iso: string) => timeFormat.format(new Date(iso))
export const formatDate = (iso: string) => dateFormat.format(new Date(iso))
