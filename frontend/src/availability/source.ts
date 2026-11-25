import { addDays } from '@/events/week'
import { slotStart, type AvailabilityInput } from './slots'

/**
 * 가능 시간 데이터 경계.
 * 화면(AvailabilityPage)은 이 인터페이스만 알고, 데이터가 어디서 오는지는 모른다.
 *
 * ▶ 백엔드 API가 생기면 이 파일에 실제 구현을 하나 추가하고, 아래 `availabilitySource`만 바꾸면 된다.
 *   예상 계약 (shared/src/schemas.ts에 백엔드와 합의해 추가할 것):
 *     GET /orgs/{orgId}/availability?from&to  → { inputs: AvailabilityInput[] }   (조직 멤버 전원)
 *     PUT /orgs/{orgId}/availability/me       ← { from, to, inputs: AvailabilityInput[] }
 *                                                (그 구간의 내 가능 시간을 통째로 교체)
 *   "통째로 교체" 방식이면 선택 해제도 자연스럽게 반영된다.
 *   (일정 API로 tentative 일정을 쓰는 방법은 일정 삭제 API가 없어 해제를 반영할 수 없다)
 */
export interface AvailabilitySource {
  /** 이 구간과 겹치는 조직 멤버 전원(나 포함)의 가능 시간 */
  load(orgId: string, from: Date, to: Date): Promise<AvailabilityInput[]>
  /** 이 구간의 내 가능 시간을 mine으로 교체한다 (빈 배열이면 전부 해제) */
  saveMine(orgId: string, userId: string, from: Date, to: Date, mine: AvailabilityInput[]): Promise<void>
}

// ---------------------------------------------------------------
// Mock 구현: 서버 대신 메모리에 저장하고, 예시 팀원 2명의 가능 시간을 섞어 준다.
// (새로고침하면 내 선택은 사라진다)
// ---------------------------------------------------------------

/** 예시 팀원. 실제 조직 멤버가 아니므로 화면에서 "예시"로 표시한다. */
export const MOCK_PEOPLE: Record<string, string> = {
  'demo-a': '예시 팀원 A',
  'demo-b': '예시 팀원 B',
}

// 요일(0=월)별 예시 가능 시간 (30분 칸 번호, [from, to))
const MOCK_RANGES = [
  { userId: 'demo-a', day: 0, from: 18, to: 26 },
  { userId: 'demo-b', day: 0, from: 20, to: 28 },
  { userId: 'demo-a', day: 1, from: 24, to: 34 },
  { userId: 'demo-b', day: 1, from: 28, to: 36 },
  { userId: 'demo-a', day: 2, from: 20, to: 30 },
  { userId: 'demo-b', day: 2, from: 22, to: 32 },
  { userId: 'demo-a', day: 3, from: 18, to: 28 },
  { userId: 'demo-b', day: 3, from: 22, to: 30 },
  { userId: 'demo-a', day: 4, from: 26, to: 34 },
  { userId: 'demo-b', day: 4, from: 28, to: 36 },
]

const savedMine = new Map<string, AvailabilityInput[]>() // key: `${orgId}|${userId}`

const overlaps = (i: AvailabilityInput, from: Date, to: Date) =>
  Date.parse(i.end) > from.getTime() && Date.parse(i.start) < to.getTime()

export const mockAvailabilitySource: AvailabilitySource = {
  async load(orgId, from, to) {
    const demo = MOCK_RANGES.map(({ userId, day, from: s, to: e }) => {
      const d = addDays(from, day)
      return { userId, start: slotStart(d, s).toISOString(), end: slotStart(d, e).toISOString() }
    })
    const mine = [...savedMine.entries()]
      .filter(([key]) => key.startsWith(`${orgId}|`))
      .flatMap(([, list]) => list)
    return [...demo, ...mine].filter((i) => overlaps(i, from, to))
  },

  async saveMine(orgId, userId, from, to, mine) {
    const key = `${orgId}|${userId}`
    const outside = (savedMine.get(key) ?? []).filter((i) => !overlaps(i, from, to))
    savedMine.set(key, [...outside, ...mine])
  },
}

/** 화면이 쓰는 구현. 백엔드 API가 준비되면 여기만 바꾼다. */
export const availabilitySource: AvailabilitySource = mockAvailabilitySource
export const IS_MOCK_SOURCE = availabilitySource === mockAvailabilitySource
