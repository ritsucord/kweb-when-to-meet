
/** 백엔드에서 사용하는 데이터 형태 */
export interface AvailabilityInput {
  readonly userId: string
  readonly start: string
  readonly end: string
}

export interface AvailableSlot {
  readonly start: string
  readonly end: string
  readonly participantIds: readonly string[]
  readonly participantCount: number
}

/** 30분 단위 시간 칸을 실제 날짜로 변환 */
export function slotDate(day: Date, slot: number): Date {
  const result = new Date(day)
  result.setHours(Math.floor(slot / 2), (slot % 2) * 30, 0, 0)
  return result
}

/** 선택한 시간 칸의 고유 ID */
export function slotKey(day: Date, slot: number): string {
  return `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}-${slot}`
}

/** 다른 팀원 2명의 임시 가능 시간 */
const MOCK_RANGES = [
  { userId: 'member-a', dayIndex: 0, from: 18, to: 26 },
  { userId: 'member-b', dayIndex: 0, from: 20, to: 28 },
  { userId: 'member-a', dayIndex: 1, from: 24, to: 34 },
  { userId: 'member-b', dayIndex: 1, from: 28, to: 36 },
  { userId: 'member-a', dayIndex: 2, from: 20, to: 30 },
  { userId: 'member-b', dayIndex: 2, from: 22, to: 32 },
  { userId: 'member-a', dayIndex: 3, from: 18, to: 28 },
  { userId: 'member-b', dayIndex: 3, from: 22, to: 30 },
  { userId: 'member-a', dayIndex: 4, from: 26, to: 34 },
  { userId: 'member-b', dayIndex: 4, from: 28, to: 36 },
]

/**
 * 임시 겹침 계산 함수
 * 추후 백엔드 API가 완성되면 이 데이터 계층을 교체한다.
 */
export function getMockOverlap(
  days: Date[],
  selected: ReadonlySet<string>
): AvailableSlot[] {
  const inputs: AvailabilityInput[] = MOCK_RANGES.flatMap(
    ({ userId, dayIndex, from, to }) => {
      const day = days[dayIndex]
      if (!day) return []

      return [{
        userId,
        start: slotDate(day, from).toISOString(),
        end: slotDate(day, to).toISOString(),
      }]
    }
  )

  // 사용자가 선택한 시간을 추가
  for (const day of days) {
    for (let slot = 0; slot < 48; slot++) {
      if (!selected.has(slotKey(day, slot))) continue

      inputs.push({
        userId: 'me',
        start: slotDate(day, slot).toISOString(),
        end: slotDate(day, slot + 1).toISOString(),
      })
    }
  }

  const ranges = inputs.map((input) => ({
    userId: input.userId,
    start: Date.parse(input.start),
    end: Date.parse(input.end),
  }))

  const result: AvailableSlot[] = []

  // 각 30분 칸마다 가능한 인원 계산
  for (const day of days) {
    for (let slot = 0; slot < 48; slot++) {
      const start = slotDate(day, slot)
      const end = slotDate(day, slot + 1)

      const participantIds = [
        ...new Set(
          ranges
            .filter(
              (range) =>
                range.start <= start.getTime() &&
                range.end >= end.getTime()
            )
            .map((range) => range.userId)
        ),
      ]

      if (participantIds.length === 0) continue

      result.push({
        start: start.toISOString(),
        end: end.toISOString(),
        participantIds,
        participantCount: participantIds.length,
      })
    }
  }

  return result
}
