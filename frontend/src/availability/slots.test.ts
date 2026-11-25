import { describe, expect, it } from 'vitest'
import { cellsOf, inputsToSelection, selectionToInputs, slotStart, SLOT_MS, SLOTS_PER_DAY, usersByCell } from './slots'

// 테스트는 로컬 시각 기준으로 만든다 (실행 환경의 시간대와 상관없이 성립해야 한다)
const day = new Date(2026, 10, 10) // 2026-11-10 (로컬)
const at = (slot: number, d = day) => slotStart(d, slot).getTime()
const iso = (ms: number) => new Date(ms).toISOString()

describe('slotStart / cellsOf', () => {
  it('slot은 30분 단위다 (0 = 00:00, 19 = 09:30)', () => {
    expect(slotStart(day, 0).getHours()).toBe(0)
    expect(slotStart(day, 19).getHours()).toBe(9)
    expect(slotStart(day, 19).getMinutes()).toBe(30)
  })

  it('하루는 48칸, 칸 사이는 정확히 30분', () => {
    const cells = cellsOf([day])
    expect(cells).toHaveLength(SLOTS_PER_DAY)
    expect(cells[1] - cells[0]).toBe(SLOT_MS)
  })
})

describe('selectionToInputs', () => {
  it('연속된 칸은 하나의 [start, end) 구간으로 합친다', () => {
    const result = selectionToInputs([at(20), at(21), at(22)], 'me')
    expect(result).toEqual([{ userId: 'me', start: iso(at(20)), end: iso(at(23)) }])
  })

  it('끊긴 칸은 구간을 나눈다', () => {
    const result = selectionToInputs([at(20), at(21), at(24)], 'me')
    expect(result).toEqual([
      { userId: 'me', start: iso(at(20)), end: iso(at(22)) },
      { userId: 'me', start: iso(at(24)), end: iso(at(25)) },
    ])
  })

  it('순서가 섞이거나 중복돼도 같은 결과', () => {
    expect(selectionToInputs([at(22), at(20), at(21), at(21)], 'me')).toEqual(selectionToInputs([at(20), at(21), at(22)], 'me'))
  })

  it('자정을 넘겨 이어진 칸(23:30 → 다음 날 00:00)은 하나로 합친다', () => {
    const next = new Date(2026, 10, 11)
    const result = selectionToInputs([at(47), at(0, next)], 'me')
    expect(result).toEqual([{ userId: 'me', start: iso(at(47)), end: iso(at(1, next)) }])
  })

  it('보내는 시각은 UTC(Z) 문자열이다 (서버는 +09:00 같은 오프셋을 거절한다)', () => {
    const [input] = selectionToInputs([at(20)], 'me')
    expect(input.start.endsWith('Z')).toBe(true)
  })

  it('선택이 없으면 빈 목록', () => {
    expect(selectionToInputs([], 'me')).toEqual([])
  })
})

describe('inputsToSelection', () => {
  it('selectionToInputs의 역변환이다 (저장 → 다시 불러오기)', () => {
    const cells = cellsOf([day])
    const picked = new Set([at(20), at(21), at(30)])
    expect(inputsToSelection(selectionToInputs(picked, 'me'), cells)).toEqual(picked)
  })

  it('칸을 일부만 덮는 구간은 그 칸을 선택하지 않는다', () => {
    const cells = cellsOf([day])
    const partial = [{ userId: 'me', start: iso(at(20) + 10 * 60 * 1000), end: iso(at(22)) }] // 10:10 ~ 11:00
    expect(inputsToSelection(partial, cells)).toEqual(new Set([at(21)]))
  })
})

describe('usersByCell', () => {
  const cells = cellsOf([day])

  it('칸마다 그 칸을 완전히 덮는 사용자를 센다', () => {
    const inputs = [
      { userId: 'a', start: iso(at(20)), end: iso(at(24)) },
      { userId: 'b', start: iso(at(22)), end: iso(at(26)) },
    ]
    const map = usersByCell(inputs, cells)
    expect(map.get(at(21))).toEqual(['a'])
    expect(map.get(at(22))?.sort()).toEqual(['a', 'b'])
    expect(map.get(at(24))).toEqual(['b'])
    expect(map.has(at(26))).toBe(false) // [start, end): 끝 칸은 포함하지 않는다
  })

  it('한 사람의 구간이 겹쳐도 한 번만 센다', () => {
    const inputs = [
      { userId: 'a', start: iso(at(20)), end: iso(at(24)) },
      { userId: 'a', start: iso(at(22)), end: iso(at(26)) },
    ]
    expect(usersByCell(inputs, cells).get(at(22))).toEqual(['a'])
  })
})
