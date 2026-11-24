
import { describe, expect, it } from 'vitest'
import { startOfWeek, weekdayIndex, addDays } from './week'

describe('주간 날짜 계산 테스트', () => {
  it('일요일이 속한 주의 월요일을 반환한다', () => {
    const sunday = new Date(2026, 10, 8, 15, 30)
    const monday = startOfWeek(sunday)

    expect(monday.getFullYear()).toBe(2026)
    expect(monday.getMonth()).toBe(10)
    expect(monday.getDate()).toBe(2)
    expect(monday.getHours()).toBe(0)
    expect(monday.getMinutes()).toBe(0)
  })

  it('월요일은 0, 일요일은 6으로 계산한다', () => {
    expect(weekdayIndex(new Date(2026, 10, 9))).toBe(0)
    expect(weekdayIndex(new Date(2026, 10, 8))).toBe(6)
  })

  it('날짜에 3일을 더한다', () => {
    const original = new Date(2026, 10, 9)
    const result = addDays(original, 3)

    expect(result.getDate()).toBe(12)
    expect(original.getDate()).toBe(9)
  })
})
