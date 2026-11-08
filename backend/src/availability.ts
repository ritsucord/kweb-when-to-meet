/** 한 사용자가 참석 가능한 시간 구간이다. 시작과 종료 시각은 ISO 8601 문자열로 받는다. */
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

/**
 * 참석 가능한 사용자 구성이 같은 연속 시간 구간을 계산한다.
 * 시간 구간은 [start, end)로 처리하며, 한 사용자를 중복으로 세지 않는다.
 * 이 함수는 시간 계산만 담당한다. 가능한 일정의 기준과 조회 권한은 호출하는 쪽에서 검증해야 한다.
 */
export function findCommonAvailability(
    inputs: readonly AvailabilityInput[],
    options: { readonly minParticipants: number; readonly minDurationMinutes?: number },
): AvailableSlot[] {
    const { minParticipants, minDurationMinutes = 0 } = options
    if (!Number.isSafeInteger(minParticipants) || minParticipants < 1) {
        throw new RangeError('minParticipants must be a positive integer')
    }
    if (!Number.isFinite(minDurationMinutes) || minDurationMinutes < 0) {
        throw new RangeError('minDurationMinutes must be nonnegative')
    }

    const perUser = new Map<string, Array<[number, number]>>()
    for (const item of inputs) {
        if (!item.userId) throw new RangeError('userId is required')
        const start = Date.parse(item.start)
        const end = Date.parse(item.end)
        if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
            throw new RangeError('each interval must have valid start < end')
        }
        const list = perUser.get(item.userId) ?? []
        list.push([start, end])
        perUser.set(item.userId, list)
    }

    // 한 사용자가 입력한 겹치거나 맞닿은 시간 구간을 먼저 병합해 중복 집계를 방지한다.
    const changes = new Map<number, Array<{ userId: string; delta: 1 | -1 }>>()
    const addChange = (at: number, userId: string, delta: 1 | -1) => {
        const list = changes.get(at) ?? []
        list.push({ userId, delta })
        changes.set(at, list)
    }
    for (const [userId, ranges] of perUser) {
        ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1])
        let merged: [number, number] | undefined
        for (const [start, end] of ranges) {
            if (merged && start <= merged[1]) merged[1] = Math.max(merged[1], end)
            else {
                if (merged) {
                    addChange(merged[0], userId, 1)
                    addChange(merged[1], userId, -1)
                }
                merged = [start, end]
            }
        }
        if (merged) {
            addChange(merged[0], userId, 1)
            addChange(merged[1], userId, -1)
        }
    }

    // 시작·종료 시각을 정렬한 뒤, 각 구간에서 참석 가능한 사용자 목록을 구한다.
    const times = [...changes.keys()].sort((a, b) => a - b)
    const active = new Set<string>()
    const slots: Array<{ startMs: number; endMs: number; participantIds: string[] }> = []
    for (let i = 0; i < times.length - 1; i++) {
        const startMs = times[i]!
        for (const change of changes.get(startMs) ?? []) {
            if (change.delta === -1) active.delete(change.userId)
        }
        for (const cha                          
        if (prev && prev.endMs === startMs &&
            prev.participantIds.length === participantIds.length &&
            prev.participantIds.every((id, index) => id === participantIds[index])) {
            prev.endMs = endMs
        } else {
            slots.push({ startMs, endMs, participantIds })
        }
    }
    // 최소 회의 길이를 만족하는 구간만 결과로 반환한다.
    return slots
        .filter(slot => slot.endMs - slot.startMs >= minDurationMinutes * 60_000)
        .map(slot => ({
            start: new Date(slot.startMs).toISOString(),
            end: new Date(slot.endMs).toISOString(),
            participantIds: slot.participantIds,
            participantCount: slot.participantIds.length,
        }))
}
