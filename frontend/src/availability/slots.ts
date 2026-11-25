// 가능 시간 격자 계산용 순수 함수 모음 (React와 무관 → 단위 테스트 대상: slots.test.ts)
//
// 칸(cell) 하나 = 30분. 칸은 "그 칸이 시작하는 시각의 epoch ms(숫자)"로 식별한다.
// 날짜 문자열 대신 시각 숫자를 쓰면, 날짜·자정 경계와 상관없이 "바로 다음 칸인가?"를
// (다음 칸 시작 === 이전 칸 시작 + 30분)으로 판단할 수 있다.

export const SLOT_MINUTES = 30
export const SLOT_MS = SLOT_MINUTES * 60 * 1000
export const SLOTS_PER_DAY = (24 * 60) / SLOT_MINUTES // 48

/**
 * 한 사용자가 참석 가능한 시간 구간. [start, end) — 끝 시각은 포함하지 않는다.
 * 백엔드 backend/src/availability.ts(feature/availability-overlap)의 AvailabilityInput과 같은 형태다.
 */
export interface AvailabilityInput {
  readonly userId: string
  readonly start: string // UTC ISO 문자열 (…Z)
  readonly end: string
}

/** day(로컬 날짜)의 slot번째 칸이 시작하는 시각 */
export function slotStart(day: Date, slot: number): Date {
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate())
  d.setHours(Math.floor(slot / 2), (slot % 2) * SLOT_MINUTES, 0, 0)
  return d
}

/** 주어진 날들의 모든 칸 시작 시각(ms)을 시간순으로 */
export function cellsOf(days: readonly Date[]): number[] {
  return days.flatMap((day) => Array.from({ length: SLOTS_PER_DAY }, (_, s) => slotStart(day, s).getTime()))
}

/**
 * 선택한 칸들 → 서버로 보낼 구간 목록.
 * 연속된 칸은 하나의 [start, end)로 합치고, 끊긴 곳에서 나눈다. 자정을 넘겨 이어진 칸도 하나로 합친다.
 */
export function selectionToInputs(cells: Iterable<number>, userId: string): AvailabilityInput[] {
  const sorted = [...new Set(cells)].sort((a, b) => a - b)
  const result: AvailabilityInput[] = []
  let runStart: number | null = null
  let prev = 0
  for (const cell of sorted) {
    if (runStart === null) {
      runStart = cell
    } else if (cell !== prev + SLOT_MS) {
      result.push(toInput(userId, runStart, prev + SLOT_MS))
      runStart = cell
    }
    prev = cell
  }
  if (runStart !== null) result.push(toInput(userId, runStart, prev + SLOT_MS))
  return result
}

function toInput(userId: string, start: number, end: number): AvailabilityInput {
  return { userId, start: new Date(start).toISOString(), end: new Date(end).toISOString() }
}

/** 구간 목록 → 그 구간이 "완전히 덮는" 칸들 (화면에 저장된 내 선택을 다시 칠할 때) */
export function inputsToSelection(inputs: readonly AvailabilityInput[], cells: readonly number[]): Set<number> {
  const ranges = inputs.map((i) => [Date.parse(i.start), Date.parse(i.end)] as const)
  return new Set(cells.filter((c) => ranges.some(([s, e]) => s <= c && c + SLOT_MS <= e)))
}

/**
 * 칸마다 가능한 사용자 목록. 칸 [c, c+30분)을 완전히 덮는 구간이 있는 사용자만 센다.
 * 한 사용자의 구간이 겹쳐 있어도 한 번만 센다.
 */
export function usersByCell(inputs: readonly AvailabilityInput[], cells: readonly number[]): Map<number, string[]> {
  const ranges = inputs.map((i) => ({ userId: i.userId, s: Date.parse(i.start), e: Date.parse(i.end) }))
  const result = new Map<number, string[]>()
  for (const c of cells) {
    const users = new Set<string>()
    for (const r of ranges) if (r.s <= c && c + SLOT_MS <= r.e) users.add(r.userId)
    if (users.size > 0) result.set(c, [...users])
  }
  return result
}
