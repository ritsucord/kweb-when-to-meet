import { useId, type ReactElement, type ReactNode } from 'react'
import { cloneElement } from 'react'
import { Label } from '@/components/ui/label'

/**
 * 라벨 + 입력칸 + 오류 문구 묶음.
 * 자식 입력칸에 id, aria-invalid, aria-describedby를 자동으로 붙여서
 * 라벨 클릭/스크린리더/오류 테두리(aria-invalid 스타일)가 함께 동작한다.
 */
export function FormField({ label, hint, error, children }: {
  label: ReactNode
  hint?: ReactNode
  error?: string
  children: ReactElement<Record<string, unknown>>
}) {
  const id = useId()
  const errorId = `${id}-error`
  return (
    <div className="grid gap-2">
      <Label htmlFor={id} className="text-sm font-semibold">
        {label}
        {hint && <span className="font-normal text-ink-soft">{hint}</span>}
      </Label>
      {cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? errorId : undefined,
      })}
      {error && <p id={errorId} className="text-sm font-medium text-accent-ink">{error}</p>}
    </div>
  )
}
