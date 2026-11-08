import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findCommonAvailability } from './availability.js'

const t = (hour: number) => `2026-11-10T${String(hour).padStart(2, '0')}:00:00.000Z`
const a = (userId: string, start: number, end: number) => ({ userId, start: t(start), end: t(end) })

test('세 명의 공통 가능 시간 구간을 찾는다', () => {
    const result = findCommonAvailability([
        a('alice', 14, 17), a('bob', 15, 18), a('carol', 16, 19),
    ], { minParticipants: 3 })
    assert.deepEqual(result, [{
        start: t(16), end: t(17), participantIds: ['alice', 'bob', 'carol'], participantCount: 3,
    }])
})

test('한 사람의 겹치는 입력을 두 번 세지 않는다', () => {
    const result = findCommonAvailability([
        a('alice', 14, 17), a('alice', 15, 18), a('bob', 16, 19),
    ], { minParticipants: 2 })
    assert.deepEqual(result, [{
        start: t(16), end: t(18), participantIds: ['alice', 'bob'], participantCount: 2,
    }])
})

test('최소 회의 길이를 만족하지 않으면 제외한다', () => {
    const entries = [a('alice', 14, 17), a('bob', 16, 18)]
    assert.equal(findCommonAvailability(entries, { minParticipants: 2, minDurationMinutes: 90 }).length, 0)
    assert.equal(findCommonAvailability(entries, { minParticipants: 2, minDurationMinutes: 60 }).length, 1)
})

test('끝나는 시각과 시작하는 시각만 맞닿으면 겹치지 않는다', () => {
    assert.deepEqual(findCommonAvailability([
        a('alice', 14, 15), a('bob', 15, 16),
    ], { minParticipants: 2 }), [])
})

test('비정상 시간과 조건을 거부한다', () => {
    assert.throws(() => findCommonAvailability([a('alice', 17, 14)], { minParticipants: 1 }), RangeError)
    assert.throws(() => findCommonAvailability([], { minParticipants: 0 }), RangeError)
})
