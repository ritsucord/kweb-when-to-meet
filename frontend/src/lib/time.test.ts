
import { describe, expect, it } from 'vitest'
import {
  fromLocalInput,
  toLocalInput,
  toServerTime,
} from './time'

describe('시간 변환 테스트', () => {
  it('Date를 서버용 UTC 문자열로 변환한다', () => {
    const date = new Date('2026-11-10T03:00:00.000Z')

    expect(toServerTime(date)).toBe(
      '2026-11-10T03:00:00.000Z'
    )
  })

  it('Date를 로컬 입력 형식으로 변환한다', () => {
    const date = new Date(2026, 10, 10, 12, 5)

    expect(toLocalInput(date)).toBe(
      '2026-11-10T12:05'
    )
  })

  it('로컬 입력 문자열을 Date로 변환한다', () => {
    const date = fromLocalInput('2026-11-10T12:05')

    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(10)
    expect(date.getDate()).toBe(10)
    expect(date.getHours()).toBe(12)
    expect(date.getMinutes()).toBe(5)
  })

  it('로컬 시간 변환 후 다시 복원할 수 있다', () => {
    const original = new Date(2026, 10, 10, 15, 30)

    const text = toLocalInput(original)
    const restored = fromLocalInput(text)

    expect(restored.getTime()).toBe(original.getTime())
  })
})
