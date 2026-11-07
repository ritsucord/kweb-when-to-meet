import assert from 'node:assert/strict'
import { openDb } from './db.js'
import { createContext, DomainError } from './util.js'
import type { Context } from './util.js'
import type { DomainErrorCode } from './util.js'

// 테스트 전용 도구다. 빌드에는 포함하지 않는다. (tsconfig.build.json)

export const T = (value: string) => Temporal.Instant.from(value)

// 테스트마다 새 인메모리 DB를 쓴다.
export const newContext = (): Context => createContext(openDb(':memory:'))

export const count = (ctx: Context, sql: string, ...params: unknown[]): number =>
    (ctx.db.prepare(sql).get(...params) as { c: number }).c

// 던져진 DomainError의 code를 돌려준다. 던지지 않으면 'none'이다.
export function codeOf(fn: () => unknown): DomainErrorCode | 'none' {
    try {
        fn()
    } catch (e) {
        if (e instanceof DomainError) return e.code
        throw e
    }
    return 'none'
}

export const expectCode = (fn: () => unknown, code: DomainErrorCode) => assert.equal(codeOf(fn), code)
