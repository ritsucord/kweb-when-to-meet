
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { fieldErrors } from './form'

describe('폼 검증 테스트', () => {
  const schema = z.object({
    name: z.string().min(2),
    age: z.number().min(1),
  })

  it('잘못된 입력에 기본 오류 메시지를 반환한다', () => {
    const result = schema.safeParse({
      name: '',
      age: 0,
    })

    expect(result.success).toBe(false)

    if (!result.success) {
      expect(fieldErrors(result.error)).toEqual({
        name: '올바른 값을 입력해 주세요.',
        age: '올바른 값을 입력해 주세요.',
      })
    }
  })

  it('사용자가 지정한 오류 메시지를 반환한다', () => {
    const result = schema.safeParse({
      name: '',
      age: 0,
    })

    if (!result.success) {
      const errors = fieldErrors(result.error, {
        name: '이름은 2글자 이상 입력하세요.',
      })

      expect(errors.name).toBe(
        '이름은 2글자 이상 입력하세요.'
      )
      expect(errors.age).toBe(
        '올바른 값을 입력해 주세요.'
      )
    }
  })

  it('같은 필드에 오류가 여러 개여도 하나만 반환한다', () => {
    const result = z.object({
      name: z.string().min(3).regex(/^[A-Z]+$/),
    }).safeParse({
      name: '',
    })

    if (!result.success) {
      const errors = fieldErrors(result.error)

      expect(Object.keys(errors)).toEqual(['name'])
    }
  })
})
